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

    console.log('[PitchDetector] Starting...')

    try {
      // 静态导入 react-native-audio-api
      const { AudioContext } = await import('react-native-audio-api')

      console.log('[PitchDetector] AudioContext imported')

      // 创建音频上下文 - 使用默认采样率
      this.audioContext = new AudioContext()
      console.log('[PitchDetector] AudioContext created, sample rate:', this.audioContext.sampleRate)

      // 创建流节点（从麦克风获取音频）
      this.streamerNode = this.audioContext.createStreamer()
      console.log('[PitchDetector] StreamerNode created')

      // 创建音频处理节点 - 在 UI 线程运行
      this.workletNode = this.audioContext.createWorkletNode(
        (audioData: Array<Float32Array>, channelCount: number) => {
          console.log('[PitchDetector] Worklet callback called, audioData length:', audioData.length)
          if (audioData.length > 0 && audioData[0].length >= CONFIG.YIN_BUFFER_SIZE) {
            console.log('[PitchDetector] Processing audio buffer...')
            this.processAudio(audioData[0])
          }
        },
        CONFIG.YIN_BUFFER_SIZE,
        1, // 单声道
        'UIRuntime' // 在 UI 线程运行，避免 worklet 问题
      )
      console.log('[PitchDetector] WorkletNode created')

      // 连接节点
      this.streamerNode.connect(this.workletNode)
      this.workletNode.connect(this.audioContext.destination)
      console.log('[PitchDetector] Nodes connected')

      this.isRunning = true
      this.startTime = Date.now()

      // 开始音频流
      this.streamerNode.start()
      console.log('[PitchDetector] StreamerNode started')

      console.log('[PitchDetector] Pitch detection started successfully')
    } catch (error) {
      console.error('[PitchDetector] Failed to start pitch detection:', error)
      throw error
    }
  }

  // 停止音高检测
  async stop(): Promise<void> {
    if (!this.isRunning) return

    console.log('[PitchDetector] Stopping...')

    try {
      if (this.workletNode) {
        this.workletNode.disconnect()
        this.workletNode = null
      }
      if (this.streamerNode) {
        this.streamerNode.stop()
        this.streamerNode.disconnect()
        this.streamerNode = null
      }
      if (this.audioContext) {
        await this.audioContext.close()
        this.audioContext = null
      }

      this.isRunning = false
      console.log('[PitchDetector] Pitch detection stopped')
    } catch (error) {
      console.error('[PitchDetector] Failed to stop pitch detection:', error)
    }
  }

  // 处理音频数据
  private processAudio(audioBuffer: Float32Array) {
    console.log('[PitchDetector] processAudio called, buffer length:', audioBuffer.length)

    if (!this.isRunning) return

    try {
      // 使用 YIN 算法检测音高
      const result = this.yinDetector.detectPitch(audioBuffer)
      console.log('[PitchDetector] YIN result:', result)

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

        console.log('[PitchDetector] Detected pitch:', detectionResult)

        // 通知回调
        if (this.onPitchDetected) {
          this.onPitchDetected(detectionResult)
        }
      }
    } catch (error) {
      console.error('[PitchDetector] Error processing audio:', error)
    }
  }
}

// 单例
export const pitchDetector = new PitchDetector()
