/**
 * AudioService 录音状态机测试
 *
 * 测试范围：
 *   1. idle → recording (startRecording)
 *   2. recording → paused (pauseRecording)
 *   3. paused → recording (resumeRecording)
 *   4. recording/paused → stopped (stopRecording)
 *   5. 幂等性：double-pause / double-resume 无副作用
 *   6. onPitchDataUpdate 回调触发逻辑
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────

// storage.ts 引入了 AsyncStorage 和 nativePitchRecorder，直接 mock 整个模块避免 native 依赖
jest.mock('../../src/services/storage', () => ({
  resolveAudioPath: jest.fn().mockImplementation((p: string) => Promise.resolve(p)),
}))

let pitchCallback: ((arg: { freq: number }) => void) | null = null

jest.mock('react-native', () => ({
  NativeModules: {
    PitchDetectorModule: {},
    AudioSessionModule: {
      resetForPlayback: jest.fn(),
      deactivate: jest.fn(),
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn().mockImplementation((_event, cb) => {
      pitchCallback = cb
      return { remove: jest.fn() }
    }),
  })),
}))

jest.mock('../../src/services/nativePitchRecorder', () => ({
  nativePitchRecorder: {
    startDetection: jest.fn().mockResolvedValue(undefined),
    stopDetection: jest.fn().mockResolvedValue(undefined),
    startRecording: jest.fn().mockResolvedValue('rec_123.wav'),
    stopRecording: jest.fn().mockResolvedValue('rec_123.wav'),
    getRecordingsDirectory: jest.fn().mockResolvedValue('/mock/recordings'),
    pauseRecording: jest.fn(),
    resumeRecording: jest.fn(),
    addPitchListener: jest.fn().mockImplementation((cb) => {
      // 包一层，模拟真实 emitter 的 { freq } 解包
      pitchCallback = ({ freq }: { freq: number }) => cb(freq)
      return { remove: jest.fn() }
    }),
    resolveRecordingPath: jest.fn().mockImplementation((f: string) => Promise.resolve(`/mock/recordings/${f}`)),
  },
}))

jest.mock('../../src/utils/audioUtils', () => ({
  audioPlayer: {
    release: jest.fn(),
    stopAll: jest.fn(),
  },
}))

// react-native-sound mock：手动控制加载回调和播放回调，模拟异步加载完成
let soundCallback: ((error: any) => void) | null = null
let playCallback: ((success: boolean) => void) | null = null

const mockSoundInstance = {
  setCurrentTime: jest.fn(),
  play: jest.fn().mockImplementation((cb: (s: boolean) => void) => { playCallback = cb }),
  release: jest.fn(),
  getCurrentTime: jest.fn(),
}

jest.mock('react-native-sound', () =>
  jest.fn().mockImplementation((_path: string, _base: string, cb: (err: any) => void) => {
    soundCallback = cb
    return mockSoundInstance
  })
)

// ─── Helpers ───────────────────────────────────────────────────────────────

import { AudioService } from '../../src/services/audio'
import { nativePitchRecorder } from '../../src/services/nativePitchRecorder'

function emitPitch(freq: number) {
  pitchCallback?.({ freq })
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('录音状态机', () => {
  let service: AudioService

  beforeEach(() => {
    jest.clearAllMocks()
    pitchCallback = null
    soundCallback = null
    playCallback = null
    service = new AudioService()
  })

  // 1. startRecording
  // ─────────────────────────────────────────────────────────────────────────
  describe('startRecording', () => {
    it('返回非空的 recordingId', async () => {
      const id = await service.startRecording()
      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
    })

    it('调用 startDetection 和 startRecording', async () => {
      await service.startRecording(600, 100)
      expect(nativePitchRecorder.startDetection).toHaveBeenCalledWith(100)
      expect(nativePitchRecorder.startRecording).toHaveBeenCalled()
    })

    it('录音中 getRecordingElapsed 返回大于等于 0 的值', async () => {
      await service.startRecording()
      expect(service.getRecordingElapsed()).toBeGreaterThanOrEqual(0)
    })
  })

  // 2. pauseRecording
  // ─────────────────────────────────────────────────────────────────────────
  describe('pauseRecording', () => {
    it('录音中暂停：调用 nativePitchRecorder.pauseRecording', async () => {
      await service.startRecording()
      await service.pauseRecording()
      expect(nativePitchRecorder.pauseRecording).toHaveBeenCalledTimes(1)
    })

    it('未录音时暂停：不调用 nativePitchRecorder.pauseRecording', async () => {
      await service.pauseRecording()
      expect(nativePitchRecorder.pauseRecording).not.toHaveBeenCalled()
    })

    it('已暂停状态再次暂停：幂等，不重复调用', async () => {
      await service.startRecording()
      await service.pauseRecording()
      await service.pauseRecording()
      expect(nativePitchRecorder.pauseRecording).toHaveBeenCalledTimes(1)
    })
  })

  // 3. resumeRecording
  // ─────────────────────────────────────────────────────────────────────────
  describe('resumeRecording', () => {
    it('暂停后恢复：调用 nativePitchRecorder.resumeRecording', async () => {
      await service.startRecording()
      await service.pauseRecording()
      await service.resumeRecording()
      expect(nativePitchRecorder.resumeRecording).toHaveBeenCalledTimes(1)
    })

    it('未暂停时恢复：不调用 nativePitchRecorder.resumeRecording', async () => {
      await service.startRecording()
      await service.resumeRecording()
      expect(nativePitchRecorder.resumeRecording).not.toHaveBeenCalled()
    })

    it('已恢复状态再次恢复：幂等，不重复调用', async () => {
      await service.startRecording()
      await service.pauseRecording()
      await service.resumeRecording()
      await service.resumeRecording()
      expect(nativePitchRecorder.resumeRecording).toHaveBeenCalledTimes(1)
    })
  })

  // 4. stopRecording
  // ─────────────────────────────────────────────────────────────────────────
  describe('stopRecording', () => {
    it('返回 audioPath、duration、pitchData', async () => {
      await service.startRecording()
      const result = await service.stopRecording()
      expect(result).toHaveProperty('audioPath')
      expect(result).toHaveProperty('duration')
      expect(result).toHaveProperty('pitchData')
      expect(result.pitchData).toHaveProperty('data')
      expect(result.pitchData).toHaveProperty('version')
    })

    it('停止后 getRecordingElapsed 返回 0', async () => {
      await service.startRecording()
      await service.stopRecording()
      expect(service.getRecordingElapsed()).toBe(0)
    })

    it('暂停后停止：duration 不包含暂停时长（不越界）', async () => {
      jest.useFakeTimers()
      await service.startRecording()
      jest.advanceTimersByTime(2000) // 录音 2s
      await service.pauseRecording()
      jest.advanceTimersByTime(5000) // 暂停 5s（不计入）
      const result = await service.stopRecording()
      // duration 应该接近 2s，不接近 7s
      expect(result.duration).toBeLessThanOrEqual(3)
      jest.useRealTimers()
    })
  })

  // 5. pitchData 收集
  // ─────────────────────────────────────────────────────────────────────────
  describe('pitchData 收集', () => {
    it('录音中收到音高事件，getCurrentPitchData 有数据', async () => {
      await service.startRecording()
      emitPitch(440)
      emitPitch(442)
      expect(service.getCurrentPitchData().length).toBeGreaterThan(0)
    })

    it('暂停后收到音高事件，数据不增加', async () => {
      await service.startRecording()
      emitPitch(440)
      const countBeforePause = service.getCurrentPitchData().length

      await service.pauseRecording()
      emitPitch(440)
      emitPitch(440)

      expect(service.getCurrentPitchData().length).toBe(countBeforePause)
    })

    it('onPitchDataUpdate 回调在录音中被调用', async () => {
      const onUpdate = jest.fn()
      service.setOnPitchDataUpdate(onUpdate)

      jest.useFakeTimers()
      await service.startRecording()

      // 第一个事件，time 距上次 >= 100ms → 触发回调
      jest.advanceTimersByTime(200)
      emitPitch(440)

      expect(onUpdate).toHaveBeenCalled()
      jest.useRealTimers()
    })
  })
})

// ─── playAudio startTime 行为 ────────────────────────────────────────────────
//
// 验证修复：历史播放器首次拖动后点播放，应从拖动位置而非 0 开始。
// 核心路径：playAudio(path, onProgress, startTime) → sound.setCurrentTime(startTime)
//
describe('playAudio startTime', () => {
  let service: AudioService

  // 辅助：触发 sound 加载完成 + 播放完成，等待 playAudio resolve
  const resolvePlay = async (playPromise: Promise<void>) => {
    await Promise.resolve() // 等 resolveAudioPath 微任务完成
    soundCallback!(null)    // 触发加载成功回调
    playCallback!(true)     // 触发播放完成回调
    await playPromise
  }

  beforeEach(() => {
    jest.clearAllMocks()
    soundCallback = null
    playCallback = null
    service = new AudioService()
  })

  it('不传 startTime：不调用 setCurrentTime，从头播放', async () => {
    await resolvePlay(service.playAudio('test.wav'))
    expect(mockSoundInstance.setCurrentTime).not.toHaveBeenCalled()
  })

  it('startTime = 0：不调用 setCurrentTime，从头播放', async () => {
    await resolvePlay(service.playAudio('test.wav', undefined, 0))
    expect(mockSoundInstance.setCurrentTime).not.toHaveBeenCalled()
  })

  it('startTime = 10：调用 setCurrentTime(10)，从 10s 开始', async () => {
    await resolvePlay(service.playAudio('test.wav', undefined, 10))
    expect(mockSoundInstance.setCurrentTime).toHaveBeenCalledWith(10)
  })

  it('播放进行中：hasPlayback() 返回 true（togglePlayPause 走 resume 分支的前提条件）', async () => {
    const playPromise = service.playAudio('test.wav')
    await Promise.resolve()
    soundCallback!(null)
    expect(service.hasPlayback()).toBe(true)
    playCallback!(true)
    await playPromise
  })
})
