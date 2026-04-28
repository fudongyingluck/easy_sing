import { useState, useRef, useCallback } from 'react'
import { Alert, Linking, NativeModules } from 'react-native'
import RNFS from 'react-native-fs'
import { audioService } from '../services/audio'
import { savePitchData, loadRecordings, saveRecordings } from '../services/storage'
import { RecordingState, Recording, PitchDataPoint } from '../types'

export interface UseRecordingOptions {
  recordingDurationLimit: number
  pitchDetectionRate: number
  hasTemplate: boolean
  onAfterStart?: () => void
  onPause?: () => void
  onResume?: () => void
  onStop?: () => void
}

export interface UseRecordingResult {
  recordingState: RecordingState
  recordingId: string | null
  recordingTime: number
  pitchData: PitchDataPoint[]
  recordingDuration: number
  reachedDurationLimit: boolean
  startRecording: () => Promise<void>
  pauseRecording: () => Promise<void>
  resumeRecording: () => Promise<void>
  saveAndStopRecording: () => Promise<void>
  discardRecording: () => Promise<void>
  cleanup: () => void
}

export function useRecording({
  recordingDurationLimit,
  pitchDetectionRate,
  hasTemplate,
  onAfterStart,
  onPause,
  onResume,
  onStop,
}: UseRecordingOptions): UseRecordingResult {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [pitchData, setPitchData] = useState<PitchDataPoint[]>([])
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [reachedDurationLimit, setReachedDurationLimit] = useState(false)

  const recordingTimerRef = useRef<any>(null)

  const clearTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      // 有模板时检查耳机，避免模板音频被麦克风拾入录音
      if (hasTemplate) {
        const connected: boolean = await NativeModules.PitchDetectorModule?.isHeadphonesConnected?.() ?? false
        if (!connected) {
          const proceed = await new Promise<boolean>(resolve => {
            Alert.alert(
              '未检测到耳机',
              '建议佩戴耳机。模板音频外放会干扰麦克风，影响音高检测准确性。是否继续？',
              [
                { text: '取消', style: 'cancel', onPress: () => resolve(false) },
                { text: '继续', onPress: () => resolve(true) },
              ]
            )
          })
          if (!proceed) return
        }
      }

      setPitchData([])
      audioService.setOnPitchDataUpdate((data) => setPitchData(data))

      setReachedDurationLimit(false)
      audioService.setOnMaxDurationReached(() => {
        clearTimer()
        setReachedDurationLimit(true)
        setRecordingState('paused')
        audioService.pauseRecording().catch(console.error)
        onPause?.()
      })

      const id = await audioService.startRecording(recordingDurationLimit, pitchDetectionRate)
      setRecordingId(id)
      setRecordingState('recording')
      setRecordingTime(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(audioService.getRecordingElapsed())
      }, 100)

      onAfterStart?.()
    } catch (error: any) {
      if (error?.code === 'permission_denied_settings') {
        Alert.alert(
          '需要麦克风权限',
          '请前往设置开启麦克风权限，才能使用录音功能。',
          [
            { text: '取消', style: 'cancel' },
            { text: '去设置', onPress: () => Linking.openURL('app-settings:') },
          ]
        )
      } else if (error?.code !== 'permission_denied') {
        console.error('Failed to start recording:', error)
      }
    }
  }, [recordingDurationLimit, pitchDetectionRate, hasTemplate, onAfterStart, onPause, clearTimer])

  const pauseRecording = useCallback(async () => {
    try {
      clearTimer()
      await audioService.pauseRecording()
      setRecordingState('paused')
      onPause?.()
    } catch (error) {
      console.error('Failed to pause recording:', error)
    }
  }, [clearTimer, onPause])

  const resumeRecording = useCallback(async () => {
    try {
      await audioService.resumeRecording()
      setRecordingState('recording')
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(audioService.getRecordingElapsed())
      }, 100)
      onResume?.()
    } catch (error) {
      console.error('Failed to resume recording:', error)
    }
  }, [onResume])

  const saveAndStopRecording = useCallback(async () => {
    try {
      clearTimer()
      onStop?.()
      audioService.stopPlayback()
      audioService.setOnPitchDataUpdate(null)
      audioService.setOnMaxDurationReached(null)
      const result = await audioService.stopRecording()
      setRecordingState('idle')
      setRecordingDuration(result.duration)

      const currentRecordingId = recordingId
      const newRecording: Recording = {
        id: currentRecordingId!,
        name: new Date().toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).replace(/\//g, '-'),
        audioFilePath: result.audioPath,
        pitchDataKey: await savePitchData(currentRecordingId!, result.pitchData),
        duration: result.duration,
        fileSize: 0,
        createTime: new Date().toISOString(),
      }

      const recordings = await loadRecordings()
      recordings.unshift(newRecording)
      await saveRecordings(recordings)

      setRecordingId(null)
      setRecordingTime(0)
      setPitchData([])
    } catch (error) {
      console.error('Failed to save recording:', error)
    }
  }, [recordingId, clearTimer, onStop])

  const discardRecording = useCallback(async () => {
    try {
      clearTimer()
      onStop?.()
      audioService.stopPlayback()
      audioService.setOnPitchDataUpdate(null)
      audioService.setOnMaxDurationReached(null)
      const result = await audioService.stopRecording()

      if (result.audioPath) {
        try {
          const exists = await RNFS.exists(result.audioPath)
          if (exists) await RNFS.unlink(result.audioPath)
        } catch (e) {
          console.warn('Failed to delete audio file:', e)
        }
      }

      setRecordingState('idle')
      setRecordingId(null)
      setRecordingTime(0)
      setPitchData([])
    } catch (error) {
      console.error('Failed to discard recording:', error)
    }
  }, [clearTimer, onStop])

  const cleanup = useCallback(() => {
    clearTimer()
    audioService.setOnPitchDataUpdate(null)
    audioService.setOnMaxDurationReached(null)
    audioService.stopPlayback()
  }, [clearTimer])

  return {
    recordingState,
    recordingId,
    recordingTime,
    pitchData,
    recordingDuration,
    reachedDurationLimit,
    startRecording,
    pauseRecording,
    resumeRecording,
    saveAndStopRecording,
    discardRecording,
    cleanup,
  }
}
