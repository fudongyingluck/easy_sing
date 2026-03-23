import { PitchData, PitchDataPoint } from '../types'
import { CONFIG } from '../config/constants'
import { midiToNoteName } from '../utils/noteUtils'
import { Platform } from 'react-native'
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
  private onDebugInfo: ((info: string) => void) | null = null

  private pitchSubscription: any = null
  private simulatedInterval: any = null
  private maxDurationInterval: any = null

  setOnPitchDataUpdate(callback: ((data: PitchDataPoint[]) => void) | null) {
    this.onPitchDataUpdate = callback
  }

  setOnMaxDurationReached(callback: (() => void) | null) {
    this.onMaxDurationReached = callback
  }

  setOnDebugInfo(callback: ((info: string) => void) | null) {
    this.onDebugInfo = callback
  }

  async startRecording(): Promise<string> {
    console.log('[AudioService] startRecording called')
    this.stopAllIntervals()

    this.recordingId = `rec_${Date.now()}`
    this.pitchData = []
    this.recordingStartTime = Date.now()
    this.totalPausedTime = 0
    this.isRecording = true
    this.isPaused = false

    if (Platform.OS === 'ios') {
      try {
        await this.startPitchy()
      } catch (error) {
        console.error('[AudioService] Pitchy failed, falling back:', error)
        this.startSimulatedRecording()
      }
    } else {
      this.startSimulatedRecording()
    }

    this.startMaxDurationCheck()
    return this.recordingId
  }

  private async startPitchy(): Promise<void> {
    Pitchy.init({ bufferSize: 2048, minVolume: -50 })

    this.pitchSubscription = Pitchy.addListener(({ pitch }: { pitch: number }) => {
      if (!this.isRecording || this.isPaused) return
      if (pitch < 60 || pitch > 1400) return
      this.processPitchResult(pitch)
    })

    const started = await Pitchy.start()
    if (!started) throw new Error('Pitchy.start() returned false')
    console.log('[Pitchy] Started')
  }

  private processPitchResult(freq: number): void {
    const time = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
    const midi = Math.round(12 * Math.log2(freq / 440) + 69)
    const note = midiToNoteName(midi)

    this.pitchData.push({ time, freq, note })

    const maxPoints = CONFIG.PITCH_DATA_SAMPLE_RATE * MAX_RECORDING_DURATION
    if (this.pitchData.length > maxPoints) {
      this.pitchData = this.pitchData.slice(-maxPoints)
    }

    if (this.onPitchDataUpdate) {
      this.onPitchDataUpdate([...this.pitchData])
    }
  }

  private startSimulatedRecording(): void {
    const interval = 1000 / CONFIG.PITCH_DATA_SAMPLE_RATE
    this.simulatedInterval = setInterval(() => {
      if (!this.isRecording || this.isPaused) return
      const time = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
      this.processPitchResult(261.63 + Math.sin(time * 2) * 50)
    }, interval)
  }

  async pauseRecording(): Promise<void> {
    if (this.isRecording && !this.isPaused) {
      this.isPaused = true
      this.pauseStartTime = Date.now()
    }
  }

  async resumeRecording(): Promise<void> {
    if (this.isRecording && this.isPaused) {
      this.isPaused = false
      this.totalPausedTime += Date.now() - this.pauseStartTime
    }
  }

  async stopRecording(): Promise<{ audioPath: string; duration: number; pitchData: PitchData }> {
    this.stopAllIntervals()
    this.isRecording = false
    this.isPaused = false

    if (this.pitchSubscription) {
      this.pitchSubscription.remove()
      this.pitchSubscription = null
    }
    try { await Pitchy.stop() } catch {}

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

  private startMaxDurationCheck() {
    this.maxDurationInterval = setInterval(() => {
      if (!this.isRecording || this.isPaused) return
      const d = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
      if (d >= MAX_RECORDING_DURATION) {
        if (this.onMaxDurationReached) this.onMaxDurationReached()
        this.stopMaxDurationCheck()
      }
    }, 1000)
  }

  private stopMaxDurationCheck() {
    if (this.maxDurationInterval) {
      clearInterval(this.maxDurationInterval)
      this.maxDurationInterval = null
    }
  }

  private stopAllIntervals() {
    this.stopMaxDurationCheck()
    if (this.simulatedInterval) {
      clearInterval(this.simulatedInterval)
      this.simulatedInterval = null
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
