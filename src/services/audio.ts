import { PitchData, PitchDataPoint } from '../types'
import { midiToNoteName } from '../utils/noteUtils'
import { nativePitchRecorder } from './nativePitchRecorder'
import { audioPlayer } from '../utils/audioUtils'
import { resolveAudioPath } from './storage'
import { NativeModules } from 'react-native'
import { CONFIG } from '../config/constants'

const DEFAULT_MAX_DURATION = CONFIG.MAX_RECORDING_DURATION

// ─────────────────────────────────────────────────────────────────────────────
// AudioService
//
// 职责划分（两个独立关注点，互不交叉）：
//
//   [Recording]  startRecording / pauseRecording / resumeRecording / stopRecording
//                onPitchEvent → pitchData 收集 → onPitchDataUpdate 回调
//
//   [Playback]   playAudio / pausePlayback / resumePlayback / stopPlayback / seekTo
//
// 唯一耦合点：startRecording 开始前调用 stopPlayback 确保音频 session 干净。
// ─────────────────────────────────────────────────────────────────────────────
export class AudioService {

  // ── Recording state ───────────────────────────────────────────────────────
  private recordingId: string | null = null
  private pitchData: PitchDataPoint[] = []
  private recordingStartTime: number = 0
  private totalPausedTime: number = 0
  private pauseStartTime: number = 0
  private isRecording: boolean = false
  private isPaused: boolean = false
  private pitchSubscription: any = null
  private maxDurationInterval: any = null
  private pitchWindow: number[] = []
  private lastPitchUpdateTime: number = 0
  private onPitchDataUpdate: ((data: PitchDataPoint[]) => void) | null = null
  private onMaxDurationReached: (() => void) | null = null

  // ── Playback state ────────────────────────────────────────────────────────
  private playbackSound: any = null
  private playbackTimer: any = null
  private playbackResolve: (() => void) | null = null

  // ── Session helpers ───────────────────────────────────────────────────────

  /**
   * ⚠️ 唯一允许调用 resetForPlayback 的入口。
   * 必须先 release 所有钢琴 Sound 对象，否则 iOS 在 session 重激活时会自动恢复它们的播放。
   */
  private activatePlaybackSession(): void {
    audioPlayer.release()
    NativeModules.AudioSessionModule?.resetForPlayback?.()
  }

  // ── Recording callbacks ───────────────────────────────────────────────────

  setOnPitchDataUpdate(callback: ((data: PitchDataPoint[]) => void) | null) {
    this.onPitchDataUpdate = callback
  }

  setOnMaxDurationReached(callback: (() => void) | null) {
    this.onMaxDurationReached = callback
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Recording
  // ═════════════════════════════════════════════════════════════════════════

  async startRecording(durationLimit: number = DEFAULT_MAX_DURATION, detectionRate: number = 100): Promise<string> {
    // 先停掉所有回放，确保 audio session 干净
    this.stopPlayback()
    this._stopRecordingListeners()

    this.recordingId = `rec_${Date.now()}`
    this.pitchData = []
    this.pitchWindow = []
    this.totalPausedTime = 0
    this.isRecording = true
    this.isPaused = false

    this.activatePlaybackSession()
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

    // 在停止 native 之前记录时长，避免 stopDetection 耗时被计入 duration
    const duration = (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000

    this._stopRecordingListeners()
    const [filename, dir] = await Promise.all([
      nativePitchRecorder.stopRecording(),
      nativePitchRecorder.getRecordingsDirectory(),
    ])
    await nativePitchRecorder.stopDetection()
    const audioPath = filename ? `${dir}/${filename}` : ''

    this.isRecording = false
    this.isPaused = false
    NativeModules.AudioSessionModule?.deactivate?.()

    return {
      audioPath,
      duration: Math.round(duration),
      pitchData: {
        version: 1,
        duration: Math.round(duration),
        data: this.pitchData,
      },
    }
  }

  getRecordingElapsed(): number {
    if (!this.isRecording) return 0
    return (Date.now() - this.recordingStartTime - this.totalPausedTime) / 1000
  }

  getCurrentPitchData(): PitchDataPoint[] {
    return [...this.pitchData]
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

  /** 停止 pitch 订阅和时长限制计时器，不停 native engine */
  private _stopRecordingListeners(): void {
    if (this.pitchSubscription) {
      this.pitchSubscription.remove()
      this.pitchSubscription = null
    }
    if (this.maxDurationInterval) {
      clearInterval(this.maxDurationInterval)
      this.maxDurationInterval = null
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Playback
  // ═════════════════════════════════════════════════════════════════════════

  async playAudio(filePath: string, onProgress?: (time: number) => void, startTime?: number): Promise<void> {
    this.stopPlayback()
    this.activatePlaybackSession()

    const resolvedPath = await resolveAudioPath(filePath)

    // 懒加载，避免模块初始化时修改 AVAudioSession 影响录音
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SoundModule = require('react-native-sound')
    const Sound = SoundModule.default ?? SoundModule

    return new Promise((resolve, reject) => {
      const sound = new Sound(resolvedPath, '', (error: any) => {
        if (error) {
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
            sound.getCurrentTime((seconds: number) => {
              if (this.playbackSound === sound) onProgress(seconds)
            })
          }, 100)
        }

        sound.play(() => {
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
  }

  resumePlayback(onProgress?: (time: number) => void): void {
    if (!this.playbackSound) return
    this.activatePlaybackSession()
    if (this.playbackTimer) { clearInterval(this.playbackTimer); this.playbackTimer = null }
    const resumedSound = this.playbackSound
    if (onProgress) {
      this.playbackTimer = setInterval(() => {
        resumedSound.getCurrentTime((seconds: number) => {
          if (this.playbackSound === resumedSound) onProgress(seconds)
        })
      }, 100)
    }
    resumedSound.play(() => {
      if (this.playbackSound !== resumedSound) return
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
    this.playbackResolve?.()
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
}

export const audioService = new AudioService()
