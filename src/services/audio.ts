import { PitchData, PitchDataPoint } from '../types'
import { CONFIG } from '../config/constants'
import { midiToNoteName } from '../utils/noteUtils'
import { nativePitchRecorder } from './nativePitchRecorder'

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
    if (this.pitchSubscription) {
      this.pitchSubscription.remove()
      this.pitchSubscription = null
    }
    if (this.maxDurationInterval) {
      clearInterval(this.maxDurationInterval)
      this.maxDurationInterval = null
    }
    const audioPath = await nativePitchRecorder.stopRecording()
    await nativePitchRecorder.stopDetection()
    return audioPath
  }

  async playAudio(filePath: string, onProgress?: (time: number) => void): Promise<void> {
    // TODO: 用 react-native-sound 播放 WAV 文件
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
