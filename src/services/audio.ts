import { PitchData, PitchDataPoint } from '../types'
import { CONFIG } from '../config/constants'
import { midiToNoteName } from '../utils/noteUtils'

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

  private updateInterval: any = null
  private maxDurationInterval: any = null

  setOnPitchDataUpdate(callback: ((data: PitchDataPoint[]) => void) | null) {
    this.onPitchDataUpdate = callback
  }

  setOnMaxDurationReached(callback: (() => void) | null) {
    this.onMaxDurationReached = callback
  }

  async startRecording(): Promise<string> {
    // 确保先停止之前的
    this.stopAllIntervals()

    this.recordingId = `rec_${Date.now()}`
    this.pitchData = []
    this.recordingStartTime = Date.now()
    this.totalPausedTime = 0
    this.isRecording = true
    this.isPaused = false

    this.startUpdateLoop()
    this.startMaxDurationCheck()

    console.log('Recording started')
    return this.recordingId
  }

  async pauseRecording(): Promise<void> {
    if (this.isRecording && !this.isPaused) {
      this.isPaused = true
      this.pauseStartTime = Date.now()
      console.log('Recording paused')
    }
  }

  async resumeRecording(): Promise<void> {
    if (this.isRecording && this.isPaused) {
      this.isPaused = false
      this.totalPausedTime += Date.now() - this.pauseStartTime
      console.log('Recording resumed')
    }
  }

  async stopRecording(): Promise<{ audioPath: string; duration: number; pitchData: PitchData }> {
    this.stopAllIntervals()
    this.isRecording = false
    this.isPaused = false

    const duration = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000

    console.log('Recording stopped, duration:', duration)
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

  private startUpdateLoop() {
    const interval = 1000 / CONFIG.PITCH_DATA_SAMPLE_RATE

    this.updateInterval = setInterval(() => {
      if (!this.isRecording || this.isPaused) {
        return
      }

      const time = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000

      // 模拟音高数据
      const simulatedFreq = 261.63 + Math.sin(time * 2) * 50
      const midi = Math.round(12 * Math.log2(simulatedFreq / 440) + 69)
      const note = midiToNoteName(midi)

      this.pitchData.push({
        time,
        freq: simulatedFreq,
        note
      })

      if (this.onPitchDataUpdate) {
        this.onPitchDataUpdate([...this.pitchData])
      }
    }, interval)
  }

  private startMaxDurationCheck() {
    this.maxDurationInterval = setInterval(() => {
      if (!this.isRecording || this.isPaused) {
        return
      }

      const currentDuration = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000

      if (currentDuration >= MAX_RECORDING_DURATION) {
        if (this.onMaxDurationReached) {
          this.onMaxDurationReached()
        }
        this.stopMaxDurationCheck()
      }
    }, 1000)
  }

  private stopAllIntervals() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
    if (this.maxDurationInterval) {
      clearInterval(this.maxDurationInterval)
      this.maxDurationInterval = null
    }
  }

  private stopMaxDurationCheck() {
    if (this.maxDurationInterval) {
      clearInterval(this.maxDurationInterval)
      this.maxDurationInterval = null
    }
  }

  async playAudio(filePath: string, onProgress?: (time: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let currentTime = 0
      const duration = 10

      const progressInterval = setInterval(() => {
        currentTime += 0.1
        if (onProgress) {
          onProgress(currentTime)
        }
        if (currentTime >= duration) {
          clearInterval(progressInterval)
          resolve()
        }
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
