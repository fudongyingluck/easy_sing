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
