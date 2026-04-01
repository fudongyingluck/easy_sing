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
  private lastPitchUpdateTime: number = 0

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

  async startRecording(durationLimit: number = DEFAULT_MAX_DURATION, detectionRate: number = 100): Promise<string> {
    await this.stopAll()

    this.recordingId = `rec_${Date.now()}`
    this.pitchData = []
    this.pitchWindow = []
    this.totalPausedTime = 0
    this.isRecording = true
    this.isPaused = false

    NativeModules.AudioSessionModule?.resetForPlayback?.()
    await nativePitchRecorder.startDetection(detectionRate)
    await nativePitchRecorder.startRecording()

    this.recordingStartTime = Date.now()

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
    // 若当前处于暂停状态，先把本次暂停时长计入 totalPausedTime，
    // 否则 duration 会把暂停时间也算进去（导致保存时长 > 实际文件时长）
    if (this.isPaused && this.pauseStartTime > 0) {
      this.totalPausedTime += Date.now() - this.pauseStartTime
      this.pauseStartTime = 0
    }

    // 在调用 stopAll() 之前记录时长，避免 stopDetection 耗时被计入 duration
    const duration = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000

    const audioPath = await this.stopAll()
    this.isRecording = false
    this.isPaused = false
    NativeModules.AudioSessionModule?.deactivate?.()

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
    if (this.pitchWindow.length > 3) this.pitchWindow.shift()
    const sorted = [...this.pitchWindow].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const corrected = (freq > median * 1.5 || freq < median / 1.5) ? median : freq

    const midi = Math.round(12 * Math.log2(corrected / 440) + 69)
    const note = midiToNoteName(midi)
    const time = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000

    this.pitchData.push({ time, freq: corrected, note })

    // 限流：最多 10Hz 更新 UI，避免每次事件都 spread 整个数组导致内存压力
    const now = Date.now()
    if (now - this.lastPitchUpdateTime >= 100 && this.onPitchDataUpdate) {
      this.lastPitchUpdateTime = now
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

  async playAudio(filePath: string, onProgress?: (time: number) => void, startTime?: number): Promise<void> {
    this.stopPlayback()
    NativeModules.AudioSessionModule?.resetForPlayback?.()

    // 按文件名查找：Documents 优先，兼容旧 Caches 路径，兼容重装后 UUID 变化
    const filename = filePath.split('/').pop() ?? filePath
    const resolvedPath = filename ? await nativePitchRecorder.resolveRecordingPath(filename) : filePath
    console.log('[playAudio] stored:', filePath)
    console.log('[playAudio] resolved:', resolvedPath)

    // 懒加载，避免模块初始化时修改 AVAudioSession 影响录音
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SoundModule = require('react-native-sound')
    const Sound = SoundModule.default ?? SoundModule

    return new Promise((resolve, reject) => {
      const sound = new Sound(resolvedPath, '', (error: any) => {
        if (error) {
          // loading 失败：若 sound 还是当前 active，清理掉
          if (this.playbackSound === sound) this._clearPlayback()
          sound.release()
          reject(error)
          return
        }

        // loading 完成前若 stopPlayback 已被调用（playbackSound 已被置 null），放弃播放
        if (this.playbackSound !== sound) {
          sound.release()
          resolve()
          return
        }

        this.playbackResolve = resolve

        if (startTime && startTime > 0) sound.setCurrentTime(startTime)

        if (onProgress) {
          this.playbackTimer = setInterval(() => {
            sound.getCurrentTime((seconds: number) => onProgress(seconds))
          }, 100)
        }

        sound.play(() => {
          // stopPlayback 已处理过（playbackSound 不再是 sound）则直接返回，避免重复 deactivate
          if (this.playbackSound !== sound) return
          sound.release()
          this._clearPlayback()
          NativeModules.AudioSessionModule?.deactivate?.()
          resolve()
        })
      })
      // 立即赋值，确保 stopPlayback 在 loading 期间也能 release
      this.playbackSound = sound
      this.playbackResolve = resolve
    })
  }

  pausePlayback(): void {
    this.playbackSound?.pause()
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer)
      this.playbackTimer = null
    }
    // 不调 deactivate：deactivate 会触发 iOS 音频中断，导致 react-native-sound 完成回调异常触发
    // deactivate 只在完全停止（stopPlayback）时执行
  }

  resumePlayback(onProgress?: (time: number) => void): void {
    if (!this.playbackSound) return
    NativeModules.AudioSessionModule?.resetForPlayback?.()
    if (this.playbackTimer) { clearInterval(this.playbackTimer); this.playbackTimer = null }
    if (onProgress) {
      this.playbackTimer = setInterval(() => {
        this.playbackSound?.getCurrentTime((seconds: number) => onProgress(seconds))
      }, 100)
    }
    const resumedSound = this.playbackSound
    resumedSound.play(() => {
      if (this.playbackSound !== resumedSound) return  // 已被 stopPlayback 处理
      resumedSound.release()
      this._clearPlayback()
      NativeModules.AudioSessionModule?.deactivate?.()
      this.playbackResolve?.()
    })
  }

  stopPlayback(): void {
    if (this.playbackSound) {
      this.playbackSound.stop()
      this.playbackSound.release()
      NativeModules.AudioSessionModule?.deactivate?.()
    }
    this.playbackResolve?.()  // 释放挂起的 Promise，确保 async 调用链正常结束
    this._clearPlayback()
  }

  seekTo(time: number): void {
    this.playbackSound?.setCurrentTime(time)
  }

  hasPlayback(): boolean {
    return this.playbackSound !== null
  }

  private _clearPlayback(): void {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer)
      this.playbackTimer = null
    }
    this.playbackSound = null
    this.playbackResolve = null
  }

  getRecordingElapsed(): number {
    if (!this.isRecording) return 0
    return (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
  }

  getCurrentPitchData(): PitchDataPoint[] {
    return [...this.pitchData]
  }
}

export const audioService = new AudioService()
