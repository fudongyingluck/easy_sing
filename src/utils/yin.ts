import { CONFIG } from '../config/constants'

export class YINDetector {
  private sampleRate: number
  private bufferSize: number
  private threshold: number
  private confidenceThreshold: number

  constructor(sampleRate?: number) {
    this.sampleRate = sampleRate ?? CONFIG.YIN_SAMPLE_RATE
    this.bufferSize = CONFIG.YIN_BUFFER_SIZE
    this.threshold = CONFIG.YIN_THRESHOLD
    this.confidenceThreshold = CONFIG.YIN_CONFIDENCE_THRESHOLD
  }

  setSampleRate(sampleRate: number) {
    this.sampleRate = sampleRate
  }

  // 计算 YIN 算法检测音高
  detectPitch(audioBuffer: Float32Array): { freq: number; confidence: number } {
    if (audioBuffer.length < this.bufferSize) {
      return { freq: 0, confidence: 0 }
    }

    // 步骤1: 计算差分函数
    const yinBuffer = this.calculateDifference(audioBuffer)

    // 步骤2: 计算累积均值归一化差分函数
    this.calculateCumulativeMeanNormalizedDifference(yinBuffer)

    // 步骤3: 绝对阈值
    const tau = this.absoluteThreshold(yinBuffer)

    if (tau !== -1) {
      // 步骤4: 抛物线插值
      const betterTau = this.parabolicInterpolation(yinBuffer, tau)
      const confidence = 1 - yinBuffer[tau]

      if (confidence >= this.confidenceThreshold) {
        const freq = this.sampleRate / betterTau
        return { freq, confidence }
      }
    }

    return { freq: 0, confidence: 0 }
  }

  // 步骤1: 计算差分函数
  private calculateDifference(audioBuffer: Float32Array): Float32Array {
    const yinBuffer = new Float32Array(this.bufferSize / 2)

    for (let tau = 0; tau < yinBuffer.length; tau++) {
      let sum = 0
      for (let i = 0; i < yinBuffer.length; i++) {
        const delta = audioBuffer[i] - audioBuffer[i + tau]
        sum += delta * delta
      }
      yinBuffer[tau] = sum
    }

    return yinBuffer
  }

  // 步骤2: 计算累积均值归一化差分函数
  private calculateCumulativeMeanNormalizedDifference(yinBuffer: Float32Array): void {
    let runningSum = 0
    yinBuffer[0] = 1

    for (let tau = 1; tau < yinBuffer.length; tau++) {
      runningSum += yinBuffer[tau]
      yinBuffer[tau] = yinBuffer[tau] * tau / runningSum
    }
  }

  // 步骤3: 绝对阈值
  private absoluteThreshold(yinBuffer: Float32Array): number {
    let tau = 2

    while (tau < yinBuffer.length) {
      if (yinBuffer[tau] < this.threshold) {
        while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++
        }
        return tau
      }
      tau++
    }

    return -1
  }

  // 步骤4: 抛物线插值
  private parabolicInterpolation(yinBuffer: Float32Array, tau: number): number {
    if (tau < 1) {
      return tau
    }
    if (tau + 1 >= yinBuffer.length) {
      return tau
    }

    const s0 = yinBuffer[tau - 1]
    const s1 = yinBuffer[tau]
    const s2 = yinBuffer[tau + 1]

    let delta = s2 - s0
    delta /= 2 * (2 * s1 - s2 - s0)

    return tau + delta
  }
}

// 单例
export const yinDetector = new YINDetector()
