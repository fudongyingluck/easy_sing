import { PitchData, PitchDataPoint } from '../types'
import { CONFIG } from '../config/constants'
import { midiToNoteName } from '../utils/noteUtils'
import Pitchy from 'react-native-pitchy'

const MAX_RECORDING_DURATION = CONFIG.MAX_RECORDING_DURATION

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

  constructor() {
    // JS reload 后 Pitchy native 状态可能残留，强制清理以释放 audio session
    try { Pitchy.stop() } catch {}
  }

  setOnPitchDataUpdate(callback: ((data: PitchDataPoint[]) => void) | null) {
    this.onPitchDataUpdate = callback
  }

  setOnMaxDurationReached(callback: (() => void) | null) {
    this.onMaxDurationReached = callback
  }

  async startRecording(): Promise<string> {
    this.stopAll()

    this.recordingId = `rec_${Date.now()}`
    this.pitchData = []
    this.recordingStartTime = Date.now()
    this.totalPausedTime = 0
    this.isRecording = true
    this.isPaused = false

    Pitchy.init({ bufferSize: 2048, minVolume: -50 })
    this.pitchSubscription = Pitchy.addListener(({ pitch }: { pitch: number }) => {
      if (!this.isRecording || this.isPaused) return
      if (pitch < 60 || pitch > 1400) return

      const time = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
      const midi = Math.round(12 * Math.log2(pitch / 440) + 69)
      const note = midiToNoteName(midi)
      this.pitchData.push({ time, freq: pitch, note })

      const maxPoints = CONFIG.PITCH_DATA_SAMPLE_RATE * MAX_RECORDING_DURATION
      if (this.pitchData.length > maxPoints) {
        this.pitchData = this.pitchData.slice(-maxPoints)
      }

      if (this.onPitchDataUpdate) {
        this.onPitchDataUpdate([...this.pitchData])
      }
    })

    await Pitchy.start()

    this.maxDurationInterval = setInterval(() => {
      if (!this.isRecording || this.isPaused) return
      const d = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
      if (d >= MAX_RECORDING_DURATION) {
        if (this.onMaxDurationReached) this.onMaxDurationReached()
        clearInterval(this.maxDurationInterval)
        this.maxDurationInterval = null
      }
    }, 1000)

    return this.recordingId
  }

  async pauseRecording(): Promise<void> {
    if (this.isRecording && !this.isPaused) {
      this.isPaused = true
      this.pauseStartTime = Date.now()
      // 释放麦克风，让 audio session 恢复为可播放状态
      if (this.pitchSubscription) {
        this.pitchSubscription.remove()
        this.pitchSubscription = null
      }
      try { Pitchy.stop() } catch {}
    }
  }

  async resumeRecording(): Promise<void> {
    if (this.isRecording && this.isPaused) {
      this.isPaused = false
      this.totalPausedTime += Date.now() - this.pauseStartTime
      // 重新启动麦克风
      this.pitchSubscription = Pitchy.addListener(({ pitch }: { pitch: number }) => {
        if (!this.isRecording || this.isPaused) return
        if (pitch < 60 || pitch > 1400) return

        const time = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
        const midi = Math.round(12 * Math.log2(pitch / 440) + 69)
        const note = midiToNoteName(midi)
        this.pitchData.push({ time, freq: pitch, note })

        const maxPoints = CONFIG.PITCH_DATA_SAMPLE_RATE * MAX_RECORDING_DURATION
        if (this.pitchData.length > maxPoints) {
          this.pitchData = this.pitchData.slice(-maxPoints)
        }

        if (this.onPitchDataUpdate) {
          this.onPitchDataUpdate([...this.pitchData])
        }
      })
      await Pitchy.start()
    }
  }

  async stopRecording(): Promise<{ audioPath: string; duration: number; pitchData: PitchData }> {
    this.stopAll()
    this.isRecording = false
    this.isPaused = false

    const duration = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
    return {
      audioPath: '',
      duration: Math.round(duration),
      pitchData: {
        version: 1,
        sampleRate: CONFIG.PITCH_DATA_SAMPLE_RATE,
        duration: Math.round(duration),
        data: this.pitchData
      }
    }
  }

  private stopAll() {
    if (this.pitchSubscription) {
      this.pitchSubscription.remove()
      this.pitchSubscription = null
    }
    try { Pitchy.stop() } catch {}
    if (this.maxDurationInterval) {
      clearInterval(this.maxDurationInterval)
      this.maxDurationInterval = null
    }
  }

  async playAudio(filePath: string, onProgress?: (time: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let t = 0
      const iv = setInterval(() => {
        t += 0.1
        if (onProgress) onProgress(t)
        if (t >= 10) { clearInterval(iv); resolve() }
      }, 100)
    })
  }

  pausePlayback(): void {}
  stopPlayback(): void {}
  seekTo(time: number): void {}

  getCurrentPitchData(): PitchDataPoint[] {
    return [...this.pitchData]
  }
}

export const audioService = new AudioService()
