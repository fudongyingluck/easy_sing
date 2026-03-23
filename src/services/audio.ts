import { PitchData, PitchDataPoint } from '../types'
import { CONFIG } from '../config/constants'
import { midiToNoteName } from '../utils/noteUtils'
import { Platform } from 'react-native'
import { yinDetector } from '../utils/yin'

// 检测是否是模拟器
const isSimulator = (): boolean => {
  if (Platform.OS === 'ios') {
    const isSim = Platform.constants?.isTesting || false
    return isSim
  }
  return true
}

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
  private lastPitchDataUpdateTime: number = 0

  // 真实音频相关
  private audioRecorder: any = null
  private audioContext: any = null
  private analyserNode: any = null
  private pollingInterval: any = null
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

    // 根据环境决定使用真实音频还是模拟数据
    const useRealAudio = CONFIG.FORCE_REAL_AUDIO || !isSimulator()
    console.log('[AudioService] useRealAudio:', useRealAudio)

    if (useRealAudio) {
      try {
        await this.startRealAudioRecording()
      } catch (error) {
        console.error('[AudioService] Real audio failed, falling back to simulated:', error)
        this.startSimulatedRecording()
      }
    } else {
      this.startSimulatedRecording()
    }

    this.startMaxDurationCheck()
    console.log('[AudioService] Recording setup complete')
    return this.recordingId
  }

  private async startRealAudioRecording(): Promise<void> {
    console.log('[RealAudio] Starting...')

    const { AudioContext, AudioRecorder, AudioManager } = await import('react-native-audio-api')
    console.log('[RealAudio] import done')

    // 配置 AVAudioSession 为 playAndRecord 并激活
    AudioManager.setAudioSessionOptions({ iosCategory: 'playAndRecord' })
    await AudioManager.setAudioSessionActivity(true)
    console.log('[RealAudio] session options set and activated')

    // 1. 获取设备采样率，同步 YIN
    const deviceSampleRate = AudioManager.getDevicePreferredSampleRate()
    yinDetector.setSampleRate(deviceSampleRate)
    console.log('[RealAudio] deviceSampleRate:', deviceSampleRate)

    // 2. 创建 AudioRecorder（直接 onAudioReady 推 PCM，不依赖 Web Audio 图）
    this.audioRecorder = new AudioRecorder()

    const result = this.audioRecorder.onAudioReady(
      { sampleRate: deviceSampleRate, bufferLength: CONFIG.YIN_BUFFER_SIZE, channelCount: 1 },
      (event: any) => {
        if (!this.isRecording || this.isPaused) return
        try {
          const channelData: Float32Array = event.buffer.getChannelData(0)
          this.processPitchDetection(channelData)
        } catch (err) {
          // silent
        }
      }
    )

    // 3. 开始录音
    this.audioRecorder.start()
    console.log('[RealAudio] AudioRecorder started')
  }

  private processPitchDetection(audioBuffer: Float32Array): void {
    if (!this.isRecording || this.isPaused) return

    try {
      const result = yinDetector.detectPitch(audioBuffer)
      if (result.freq > 0 && result.confidence >= CONFIG.YIN_CONFIDENCE_THRESHOLD) {
        const time = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
        const midi = Math.round(12 * Math.log2(result.freq / 440) + 69)
        const note = midiToNoteName(midi)

        this.pitchData.push({
          time,
          freq: result.freq,
          note
        })

        // 限制数据点数量，避免内存问题
        const maxPoints = CONFIG.PITCH_DATA_SAMPLE_RATE * MAX_RECORDING_DURATION
        if (this.pitchData.length > maxPoints) {
          this.pitchData = this.pitchData.slice(-maxPoints)
        }

        // 限制 UI 更新频率：最多 20fps
        const now = Date.now()
        if (this.onPitchDataUpdate && now - this.lastPitchDataUpdateTime >= 50) {
          this.lastPitchDataUpdateTime = now
          this.onPitchDataUpdate([...this.pitchData])
        }
      }
    } catch (error) {
      console.error('[PitchDetection] Error:', error)
    }
  }

  private startSimulatedRecording(): void {
    console.log('[Simulated] Starting...')
    const interval = 1000 / CONFIG.PITCH_DATA_SAMPLE_RATE

    // 使用 setInterval 模拟音频数据
    this.simulatedInterval = setInterval(() => {
      if (!this.isRecording || this.isPaused) {
        return
      }

      const time = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
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

  async pauseRecording(): Promise<void> {
    if (this.isRecording && !this.isPaused) {
      this.isPaused = true
      this.pauseStartTime = Date.now()
      console.log('[AudioService] Recording paused')
    }
  }

  async resumeRecording(): Promise<void> {
    if (this.isRecording && this.isPaused) {
      this.isPaused = false
      this.totalPausedTime += Date.now() - this.pauseStartTime
      console.log('[AudioService] Recording resumed')
    }
  }

  async stopRecording(): Promise<{ audioPath: string; duration: number; pitchData: PitchData }> {
    console.log('[AudioService] stopRecording called')
    this.stopAllIntervals()
    this.isRecording = false
    this.isPaused = false

    // 清理真实音频资源
    await this.cleanupRealAudio()

    const duration = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000

    console.log('[AudioService] Recording stopped, duration:', duration)
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

  private async cleanupRealAudio(): Promise<void> {
    try {
      if (this.audioRecorder) {
        this.audioRecorder.stop()
        this.audioRecorder = null
      }
      if (this.audioContext) {
        await this.audioContext.close()
        this.audioContext = null
      }
    } catch (error) {
      console.warn('[Cleanup] Error:', error)
    }
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
    this.stopMaxDurationCheck()
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
    if (this.simulatedInterval) {
      clearInterval(this.simulatedInterval)
      this.simulatedInterval = null
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
