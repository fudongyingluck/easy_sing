import { PitchData, PitchDataPoint } from '../types'
import { CONFIG } from '../config/constants'
import { midiToNoteName } from '../utils/noteUtils'
import { nativePitchRecorder } from './nativePitchRecorder'
import { NativeModules } from 'react-native'

const DEFAULT_MAX_DURATION = CONFIG.MAX_RECORDING_DURATION

export class AudioService {
  private recordingId: string | null = null
  private pitchData: PitchDataPoint[] = []
  private recordingStartTime: number = 0
  private totalPausedTime: number = 0
  private pauseStartTime: number = 0
  private isRecording: boolean = false
  private isPaused: boolean = false
  private onPitchDataUpdate: ((data: PitchDataPoint[]) => void) | null = null
  private onMaxDurationReached: (() => void) | null = null

  private pitchSubscription: any = null
  private maxDurationInterval: any = null
  private pitchWindow: number[] = []

  // 播放
  private playbackSound: any = null
  private playbackTimer: any = null
  private playbackResolve: (() => void) | null = null

  setOnPitchDataUpdate(callback: ((data: PitchDataPoint[]) => void) | null) {
    this.onPitchDataUpdate = callback
  }

  setOnMaxDurationReached(callback: (() => void) | null) {
    this.onMaxDurationReached = callback
  }

  async startRecording(durationLimit: number = DEFAULT_MAX_DURATION): Promise<string> {
    await this.stopAll()

    this.recordingId = `rec_${Date.now()}`
    this.pitchData = []
    this.pitchWindow = []
    this.recordingStartTime = Date.now()
    this.totalPausedTime = 0
    this.isRecording = true
    this.isPaused = false

    await nativePitchRecorder.startDetection()
    await nativePitchRecorder.startRecording()

    this.pitchSubscription = nativePitchRecorder.addPitchListener((freq) => {
      this.onPitchEvent(freq)
    })

    if (durationLimit > 0) {
      this.maxDurationInterval = setInterval(() => {
        if (!this.isRecording || this.isPaused) return
        const d = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
        if (d >= durationLimit) {
          if (this.onMaxDurationReached) this.onMaxDurationReached()
          clearInterval(this.maxDurationInterval)
          this.maxDurationInterval = null
        }
      }, 1000)
    }

    return this.recordingId
  }

  async pauseRecording(): Promise<void> {
    if (this.isRecording && !this.isPaused) {
      this.isPaused = true
      this.pauseStartTime = Date.now()
      nativePitchRecorder.pauseRecording()
    }
  }

  async resumeRecording(): Promise<void> {
    if (this.isRecording && this.isPaused) {
      this.isPaused = false
      this.totalPausedTime += Date.now() - this.pauseStartTime
      nativePitchRecorder.resumeRecording()
    }
  }

  async stopRecording(): Promise<{ audioPath: string; duration: number; pitchData: PitchData }> {
    const audioPath = await this.stopAll()
    this.isRecording = false
    this.isPaused = false

    const duration = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000

    return {
      audioPath,
      duration: Math.round(duration),
      pitchData: {
        version: 1,
        sampleRate: CONFIG.PITCH_DATA_SAMPLE_RATE,
        duration: Math.round(duration),
        data: this.pitchData
      }
    }
  }

  private onPitchEvent(freq: number) {
    if (!this.isRecording || this.isPaused) return
    if (freq < 60 || freq > 1400) return

    this.pitchWindow.push(freq)
    if (this.pitchWindow.length > 9) this.pitchWindow.shift()
    const sorted = [...this.pitchWindow].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const corrected = (freq > median * 1.25 || freq < median / 1.25) ? median : freq

    const midi = Math.round(12 * Math.log2(corrected / 440) + 69)
    const note = midiToNoteName(midi)
    const time = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000

    this.pitchData.push({ time, freq: corrected, note })

    if (this.onPitchDataUpdate) {
      this.onPitchDataUpdate([...this.pitchData])
    }
  }

  private async stopAll(): Promise<string> {
    this.stopPlayback()
    if (this.pitchSubscription) {
      this.pitchSubscription.remove()
      this.pitchSubscription = null
    }
    if (this.maxDurationInterval) {
      clearInterval(this.maxDurationInterval)
      this.maxDurationInterval = null
    }
    const [filename, dir] = await Promise.all([
      nativePitchRecorder.stopRecording(),
      nativePitchRecorder.getRecordingsDirectory(),
    ])
    await nativePitchRecorder.stopDetection()
    return filename ? `${dir}/${filename}` : ''
  }

  async playAudio(filePath: string, onProgress?: (time: number) => void): Promise<void> {
    this.stopPlayback()
    NativeModules.AudioSessionModule?.activateForRecordingPlayback?.()

    // 用当前目录重建路径，修复重装 App 后 UUID 变化导致路径失效的问题
    const filename = filePath.split('/').pop() ?? filePath
    const dir = await nativePitchRecorder.getRecordingsDirectory()
    const resolvedPath = filename ? `${dir}/${filename}` : filePath

    // 懒加载，避免模块初始化时修改 AVAudioSession 影响录音
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SoundModule = require('react-native-sound')
    const Sound = SoundModule.default ?? SoundModule

    return new Promise((resolve, reject) => {
      const sound = new Sound(resolvedPath, '', (error: any) => {
        if (error) { reject(error); return }

        this.playbackSound = sound
        this.playbackResolve = resolve

        if (onProgress) {
          this.playbackTimer = setInterval(() => {
            sound.getCurrentTime((seconds: number) => onProgress(seconds))
          }, 100)
        }

        sound.play(() => {
          // 播放结束（正常结束或被 stop 打断）统一 resolve
          this._clearPlayback()
          resolve()
        })
      })
    })
  }

  pausePlayback(): void {
    this.playbackSound?.pause()
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer)
      this.playbackTimer = null
    }
  }

  resumePlayback(onProgress?: (time: number) => void): void {
    if (!this.playbackSound) return
    NativeModules.AudioSessionModule?.activateForRecordingPlayback?.()
    if (onProgress) {
      this.playbackTimer = setInterval(() => {
        this.playbackSound?.getCurrentTime((seconds: number) => onProgress(seconds))
      }, 100)
    }
    this.playbackSound.play(() => {
      this._clearPlayback()
      this.playbackResolve?.()
    })
  }

  stopPlayback(): void {
    if (this.playbackSound) {
      this.playbackSound.stop()
      this.playbackSound.release()
    }
    this._clearPlayback()
  }

  seekTo(time: number): void {
    this.playbackSound?.setCurrentTime(time)
  }

  private _clearPlayback(): void {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer)
      this.playbackTimer = null
    }
    this.playbackSound = null
    this.playbackResolve = null
  }

  getCurrentPitchData(): PitchDataPoint[] {
    return [...this.pitchData]
  }
}

export const audioService = new AudioService()
