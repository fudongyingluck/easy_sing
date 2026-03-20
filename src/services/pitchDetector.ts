import { YINDetector } from '../utils/yin'
import { CONFIG } from '../config/constants'
import { midiToNoteName } from '../utils/noteUtils'

export interface PitchDetectionResult {
  time: number
  freq: number
  note: string | null
  confidence: number
}

export class PitchDetector {
  private yinDetector: YINDetector
  private audioContext: any = null
  private streamerNode: any = null
  private workletNode: any = null
  private isRunning = false
  private startTime: number = 0
  private onPitchDetected: ((result: PitchDetectionResult) => void) | null = null

  constructor() {
    this.yinDetector = new YINDetector()
  }

  // 设置音高检测回调
  setOnPitchDetected(callback: ((result: PitchDetectionResult) => void) | null) {
    this.onPitchDetected = callback
  }

  // 开始音高检测
  async start(): Promise<void> {
    if (this.isRunning) return

    try {
      // 动态导入 react-native-audio-api
      const { AudioContext, StreamerNode } = await import('react-native-audio-api')

      // 创建音频上下文
      this.audioContext = new AudioContext({
        sampleRate: CONFIG.YIN_SAMPLE_RATE
      })

      // 创建流节点（从麦克风获取音频）
      this.streamerNode = this.audioContext.createStreamer()

      // 创建音频处理节点
      this.workletNode = this.audioContext.createWorkletNode(
        (audioData: Array<Float32Array>, channelCount: number) => {
          if (audioData.length > 0 && audioData[0].length >= CONFIG.YIN_BUFFER_SIZE) {
            this.processAudio(audioData[0])
          }
        },
        CONFIG.YIN_BUFFER_SIZE,
        1 // 单声道
      )

      // 连接节点
      this.streamerNode.connect(this.workletNode)
      this.workletNode.connect(this.audioContext.destination)

      this.isRunning = true
      this.startTime = Date.now()

      console.log('Pitch detection started')
    } catch (error) {
      console.error('Failed to start pitch detection:', error)
      throw error
    }
  }

  // 停止音高检测
  async stop(): Promise<void> {
    if (!this.isRunning) return

    try {
      if (this.workletNode) {
        this.workletNode.disconnect()
        this.workletNode = null
      }
      if (this.streamerNode) {
        this.streamerNode.disconnect()
        this.streamerNode = null
      }
      if (this.audioContext) {
        await this.audioContext.close()
        this.audioContext = null
      }

      this.isRunning = false
      console.log('Pitch detection stopped')
    } catch (error) {
      console.error('Failed to stop pitch detection:', error)
    }
  }

  // 处理音频数据
  private processAudio(audioBuffer: Float32Array) {
    if (!this.isRunning) return

    // 使用 YIN 算法检测音高
    const result = this.yinDetector.detectPitch(audioBuffer)

    if (result.freq > 0 && result.confidence > 0) {
      // 计算时间
      const time = (Date.now() - this.startTime) / 1000

      // 转换为音符名
      const midi = Math.round(12 * Math.log2(result.freq / 440) + 69)
      const note = midiToNoteName(midi)

      const detectionResult: PitchDetectionResult = {
        time,
        freq: result.freq,
        note,
        confidence: result.confidence
      }

      // 通知回调
      if (this.onPitchDetected) {
        this.onPitchDetected(detectionResult)
      }
    }
  }
}

// 单例
export const pitchDetector = new PitchDetector()
