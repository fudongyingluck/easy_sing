/**
 * useRecording 状态机测试
 *
 * 测试范围：
 *   1. idle → recording (startRecording)
 *   2. recording → paused (pauseRecording)
 *   3. paused → recording (resumeRecording)
 *   4. recording/paused → idle (saveAndStopRecording / discardRecording)
 *   5. 有模板时的耳机检测逻辑
 *   6. discardRecording 删除音频文件
 *   7. cleanup 清理订阅
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────

let alertCallback: ((proceed: boolean) => void) | null = null

jest.mock('react-native', () => ({
  useState: jest.requireActual('react').useState,
  useRef: jest.requireActual('react').useRef,
  useCallback: jest.requireActual('react').useCallback,
  Alert: {
    alert: jest.fn().mockImplementation((_title: string, _msg: string, buttons: any[]) => {
      alertCallback = (proceed: boolean) => {
        if (proceed) buttons?.find((b: any) => b.text === '继续')?.onPress?.()
        else buttons?.find((b: any) => b.style === 'cancel')?.onPress?.()
      }
    }),
  },
  Linking: { openURL: jest.fn() },
  NativeModules: {
    PitchDetectorModule: {
      isHeadphonesConnected: jest.fn().mockResolvedValue(true),
    },
  },
}))

jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(true),
  unlink: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../src/services/audio', () => ({
  audioService: {
    startRecording: jest.fn().mockResolvedValue('rec_001'),
    pauseRecording: jest.fn().mockResolvedValue(undefined),
    resumeRecording: jest.fn().mockResolvedValue(undefined),
    stopRecording: jest.fn().mockResolvedValue({
      audioPath: '/mock/recordings/rec_001.wav',
      duration: 5,
      pitchData: { version: 1, duration: 5, data: [] },
    }),
    stopPlayback: jest.fn(),
    setOnPitchDataUpdate: jest.fn(),
    setOnMaxDurationReached: jest.fn(),
    getRecordingElapsed: jest.fn().mockReturnValue(1.5),
  },
}))

jest.mock('../../src/utils/audioUtils', () => ({
  audioPlayer: { release: jest.fn() },
}))

jest.mock('../../src/services/storage', () => ({
  savePitchData: jest.fn().mockResolvedValue('@pitchperfect:pitchdata:rec_001'),
  loadRecordings: jest.fn().mockResolvedValue([]),
  saveRecordings: jest.fn().mockResolvedValue(undefined),
}))

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { renderHook, act } from '@testing-library/react-native'
import { useRecording } from '../../src/hooks/useRecording'
import RNFS from 'react-native-fs'
import { savePitchData, loadRecordings, saveRecordings } from '../../src/services/storage'
import { NativeModules } from 'react-native'
import { audioService } from '../../src/services/audio'

// ─── Helpers ────────────────────────────────────────────────────────────────

const defaultOptions = {
  recordingDurationLimit: 600,
  pitchDetectionRate: 100,
  hasTemplate: false,
}

// ─── Tests ──────────────────────────────────────────────────────────────────

// flush pending microtasks (does NOT rely on setImmediate/setTimeout so works with fake timers)
const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('useRecording 状态机', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    alertCallback = null
    ;(audioService.startRecording as jest.Mock).mockResolvedValue('rec_001')
    ;(audioService.stopRecording as jest.Mock).mockResolvedValue({
      audioPath: '/mock/recordings/rec_001.wav',
      duration: 5,
      pitchData: { version: 1, duration: 5, data: [] },
    })
    ;(loadRecordings as jest.Mock).mockResolvedValue([])
    ;(NativeModules.PitchDetectorModule.isHeadphonesConnected as jest.Mock).mockResolvedValue(true)
    ;(RNFS.exists as jest.Mock).mockResolvedValue(true)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // 1. startRecording
  // ─────────────────────────────────────────────────────────────────────────
  describe('startRecording', () => {
    it('初始状态为 idle', () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      expect(result.current.recordingState).toBe('idle')
    })

    it('调用后状态变为 recording', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      expect(result.current.recordingState).toBe('recording')
    })

    it('调用 audioService.startRecording，传入正确参数', async () => {
      const { result } = renderHook(() => useRecording({ ...defaultOptions, pitchDetectionRate: 50 }))
      await act(async () => { await result.current.startRecording() })
      expect(audioService.startRecording).toHaveBeenCalledWith(600, 50, true)
    })

    it('有模板时：disableVoiceProcessing 仍为 true', async () => {
      const { result } = renderHook(() => useRecording({ ...defaultOptions, hasTemplate: true }))
      await act(async () => { await result.current.startRecording() })
      expect(audioService.startRecording).toHaveBeenCalledWith(600, 100, true)
    })

    it('设置 recordingId 为非空字符串', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      expect(result.current.recordingId).toBe('rec_001')
    })

    it('触发 onAfterStart 回调', async () => {
      const onAfterStart = jest.fn()
      const { result } = renderHook(() => useRecording({ ...defaultOptions, onAfterStart }))
      await act(async () => { await result.current.startRecording() })
      expect(onAfterStart).toHaveBeenCalledTimes(1)
    })
  })

  // 2. pauseRecording
  // ─────────────────────────────────────────────────────────────────────────
  describe('pauseRecording', () => {
    it('recording → paused', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.pauseRecording() })
      expect(result.current.recordingState).toBe('paused')
    })

    it('调用 audioService.pauseRecording', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.pauseRecording() })
      expect(audioService.pauseRecording).toHaveBeenCalledTimes(1)
    })

    it('触发 onPause 回调', async () => {
      const onPause = jest.fn()
      const { result } = renderHook(() => useRecording({ ...defaultOptions, onPause }))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.pauseRecording() })
      expect(onPause).toHaveBeenCalledTimes(1)
    })
  })

  // 3. resumeRecording
  // ─────────────────────────────────────────────────────────────────────────
  describe('resumeRecording', () => {
    it('paused → recording', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.pauseRecording() })
      await act(async () => { await result.current.resumeRecording() })
      expect(result.current.recordingState).toBe('recording')
    })

    it('调用 audioService.resumeRecording', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.pauseRecording() })
      await act(async () => { await result.current.resumeRecording() })
      expect(audioService.resumeRecording).toHaveBeenCalledTimes(1)
    })

    it('触发 onResume 回调', async () => {
      const onResume = jest.fn()
      const { result } = renderHook(() => useRecording({ ...defaultOptions, onResume }))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.pauseRecording() })
      await act(async () => { await result.current.resumeRecording() })
      expect(onResume).toHaveBeenCalledTimes(1)
    })
  })

  // 4. saveAndStopRecording
  // ─────────────────────────────────────────────────────────────────────────
  describe('saveAndStopRecording', () => {
    it('recording → idle', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.saveAndStopRecording() })
      expect(result.current.recordingState).toBe('idle')
    })

    it('重置 recordingId / recordingTime / pitchData', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.saveAndStopRecording() })
      expect(result.current.recordingId).toBeNull()
      expect(result.current.recordingTime).toBe(0)
      expect(result.current.pitchData).toHaveLength(0)
    })

    it('调用 savePitchData、loadRecordings、saveRecordings', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.saveAndStopRecording() })
      expect(savePitchData).toHaveBeenCalledTimes(1)
      expect(loadRecordings).toHaveBeenCalledTimes(1)
      expect(saveRecordings).toHaveBeenCalledTimes(1)
    })

    it('保存的录音排在列表第一位', async () => {
      const existing = [{ id: 'old', name: '旧录音' }]
      ;(loadRecordings as jest.Mock).mockResolvedValue([...existing])
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.saveAndStopRecording() })
      const saved = (saveRecordings as jest.Mock).mock.calls[0][0]
      expect(saved[0].id).toBe('rec_001')
      expect(saved[1].id).toBe('old')
    })

    it('触发 onStop 回调', async () => {
      const onStop = jest.fn()
      const { result } = renderHook(() => useRecording({ ...defaultOptions, onStop }))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.saveAndStopRecording() })
      expect(onStop).toHaveBeenCalledTimes(1)
    })
  })

  // 5. discardRecording
  // ─────────────────────────────────────────────────────────────────────────
  describe('discardRecording', () => {
    it('recording → idle', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.discardRecording() })
      expect(result.current.recordingState).toBe('idle')
    })

    it('删除音频文件（RNFS.unlink）', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.discardRecording() })
      expect(RNFS.unlink).toHaveBeenCalledWith('/mock/recordings/rec_001.wav')
    })

    it('音频文件不存在时不调 unlink', async () => {
      ;(RNFS.exists as jest.Mock).mockResolvedValueOnce(false)
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.discardRecording() })
      expect(RNFS.unlink).not.toHaveBeenCalled()
    })

    it('不调用 savePitchData / saveRecordings', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.discardRecording() })
      expect(savePitchData).not.toHaveBeenCalled()
      expect(saveRecordings).not.toHaveBeenCalled()
    })

    it('触发 onStop 回调', async () => {
      const onStop = jest.fn()
      const { result } = renderHook(() => useRecording({ ...defaultOptions, onStop }))
      await act(async () => { await result.current.startRecording() })
      await act(async () => { await result.current.discardRecording() })
      expect(onStop).toHaveBeenCalledTimes(1)
    })
  })

  // 6. 耳机检测（hasTemplate = true）
  // ─────────────────────────────────────────────────────────────────────────
  describe('耳机检测', () => {
    it('已连接耳机：直接开始录音，不弹 Alert', async () => {
      const { Alert } = require('react-native')
      ;(NativeModules.PitchDetectorModule.isHeadphonesConnected as jest.Mock).mockResolvedValue(true)
      const { result } = renderHook(() => useRecording({ ...defaultOptions, hasTemplate: true }))
      await act(async () => { await result.current.startRecording() })
      expect(Alert.alert).not.toHaveBeenCalled()
      expect(result.current.recordingState).toBe('recording')
    })

    it('未连接耳机：弹 Alert，用户取消 → 不开始录音', async () => {
      ;(NativeModules.PitchDetectorModule.isHeadphonesConnected as jest.Mock).mockResolvedValue(false)
      const { result } = renderHook(() => useRecording({ ...defaultOptions, hasTemplate: true }))
      const startPromise = result.current.startRecording()
      // flush isHeadphonesConnected microtask so Alert.alert gets called and alertCallback is set
      await act(async () => { await flushMicrotasks() })
      await act(async () => { alertCallback?.(false) })
      await act(async () => { await startPromise })
      expect(result.current.recordingState).toBe('idle')
      expect(audioService.startRecording).not.toHaveBeenCalled()
    })

    it('未连接耳机：弹 Alert，用户确认继续 → 正常开始录音', async () => {
      ;(NativeModules.PitchDetectorModule.isHeadphonesConnected as jest.Mock).mockResolvedValue(false)
      const { result } = renderHook(() => useRecording({ ...defaultOptions, hasTemplate: true }))
      const startPromise = result.current.startRecording()
      // flush isHeadphonesConnected microtask so Alert.alert gets called and alertCallback is set
      await act(async () => { await flushMicrotasks() })
      await act(async () => { alertCallback?.(true) })
      await act(async () => { await startPromise })
      expect(result.current.recordingState).toBe('recording')
      expect(audioService.startRecording).toHaveBeenCalledTimes(1)
    })

    it('无模板时：不检测耳机', async () => {
      const { result } = renderHook(() => useRecording({ ...defaultOptions, hasTemplate: false }))
      await act(async () => { await result.current.startRecording() })
      expect(NativeModules.PitchDetectorModule.isHeadphonesConnected).not.toHaveBeenCalled()
    })
  })

  // 7. cleanup
  // ─────────────────────────────────────────────────────────────────────────
  describe('cleanup', () => {
    it('调用 audioService.setOnPitchDataUpdate(null)', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      act(() => { result.current.cleanup() })
      const calls = (audioService.setOnPitchDataUpdate as jest.Mock).mock.calls
      expect(calls[calls.length - 1][0]).toBeNull()
    })

    it('调用 audioService.stopPlayback', async () => {
      const { result } = renderHook(() => useRecording(defaultOptions))
      await act(async () => { await result.current.startRecording() })
      act(() => { result.current.cleanup() })
      expect(audioService.stopPlayback).toHaveBeenCalled()
    })
  })
})
