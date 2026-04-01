import React, { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import RNFS from 'react-native-fs'
import { PitchChart } from '../components/PitchChart'
import { Piano } from '../components/Piano'
import { audioService } from '../services/audio'
import { audioPlayer } from '../utils/audioUtils'
import { loadUserSettings, saveUserSettings, saveRecordings, savePitchData, getRecordingPath, getPitchDataPath, loadRecordings } from '../services/storage'
import { UserSettings, AppMode, RecordingState, Recording } from '../types'
import { PRESET_MODES, CONFIG } from '../config/constants'
import { useTheme } from '../context/ThemeContext'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

export function PracticeScreen({ navigation }: any) {
  const { colors } = useTheme()
  const [appMode, setAppMode] = useState<AppMode>('recording')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [currentModeId, setCurrentModeId] = useState<string>('female')
  const [customModes, setCustomModes] = useState<any[]>([])
  const [leftYAxisDisplay, setLeftYAxisDisplay] = useState<'english' | 'solfege' | 'number'>('english')
  const [rightYAxisDisplay, setRightYAxisDisplay] = useState<'english' | 'solfege' | 'number'>('english')
  const [showBothYAxes, setShowBothYAxes] = useState(true)
  const [recordingDurationLimit, setRecordingDurationLimit] = useState(600)
  const [reachedDurationLimit, setReachedDurationLimit] = useState(false)
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [pitchData, setPitchData] = useState<any[]>([])
  const [recordingTime, setRecordingTime] = useState(0)
  const [seekTime, setSeekTime] = useState(0)
  const [previewResult, setPreviewResult] = useState<{ audioPath: string; duration: number; pitchData: any } | null>(null)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [pianoExpanded, setPianoExpanded] = useState(true)
  const [chartAreaHeight, setChartAreaHeight] = useState(SCREEN_HEIGHT * 5 / 12)

  const recordingTimerRef = useRef<any>(null)
  const lastTapTimeRef = useRef<number>(0)

  // 组件卸载时清理 timer 和 audioService 回调，防止内存泄漏
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
      audioService.setOnPitchDataUpdate(null)
      audioService.setOnMaxDurationReached(null)
      audioService.stopPlayback()
    }
  }, [])

  // 每次切换回练习 Tab 时重新加载设置
  useEffect(() => {
    const loadData = async () => {
      const settings = await loadUserSettings()
      setCurrentModeId(settings.currentModeId)
      setCustomModes(settings.customModes)
      setLeftYAxisDisplay(settings.leftYAxisDisplay)
      setRightYAxisDisplay(settings.rightYAxisDisplay)
      setShowBothYAxes(settings.showBothYAxes)
      setRecordingDurationLimit(settings.recordingDurationLimit)
    }
    loadData()
    const unsubscribeFocus = navigation.addListener('focus', loadData)
    const unsubscribeBlur = navigation.addListener('blur', () => {
      if (recordingState === 'recording') pauseRecording()
    })
    return () => { unsubscribeFocus(); unsubscribeBlur() }
  }, [navigation, recordingState])

  // 双击处理（音域区或钢琴区域）
  const handleDoubleTap = () => {
    const currentTime = Date.now()
    const timeDiff = currentTime - lastTapTimeRef.current

    if (timeDiff < CONFIG.DOUBLE_TAP_DELAY && timeDiff > 0) {
      // 检测到双击
      if (recordingState === 'recording') {
        // 正在录音时，只暂停录音（和暂停按钮效果一样）
        pauseRecording()
      } else {
        // 不在录音时，切换模式
        toggleAppMode()
      }
      lastTapTimeRef.current = 0
    } else {
      // 记录点击时间
      lastTapTimeRef.current = currentTime
    }
  }

  // 双击音域区
  const handleRangeAreaTap = handleDoubleTap

  const toggleAppMode = useCallback(() => {
    if (appMode === 'recording') {
      if (recordingState === 'recording') {
        // 正在录音，先暂停
        pauseRecording()
      }
      setAppMode('piano')
    } else {
      if (recordingState === 'paused') {
        // 恢复录音
        resumeRecording()
      }
      setAppMode('recording')
    }
  }, [appMode, recordingState])

  // 开始录音
  const startRecording = async () => {
    try {
      console.log('[Button] 开始录音')
      setPitchData([])

      // 设置音高数据更新回调
      audioService.setOnPitchDataUpdate((data) => {
        setPitchData(data)
      })

      // 设置最大时长到达回调
      setReachedDurationLimit(false)
      audioService.setOnMaxDurationReached(() => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        setReachedDurationLimit(true)
        setRecordingState('paused')
        audioService.pauseRecording().catch(console.error)
      })

      const id = await audioService.startRecording(recordingDurationLimit)
      setRecordingId(id)
      setRecordingState('recording')
      setRecordingTime(0)

      // 启动录音计时（100ms 精度，与音高数据使用同一时间源）
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(audioService.getRecordingElapsed())
      }, 100)
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }

  // 暂停录音
  const pauseRecording = async () => {
    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
      await audioService.pauseRecording()
      setRecordingState('paused')
    } catch (error) {
      console.error('Failed to pause recording:', error)
    }
  }

  // 试听（暂停后播放已录内容）
  const startPreview = async () => {
    try {
      audioService.setOnPitchDataUpdate(null)
      audioService.setOnMaxDurationReached(null)
      const result = await audioService.stopRecording()
      setPreviewResult(result)
      setIsPreviewPlaying(true)
      await audioService.playAudio(result.audioPath, (time) => setRecordingTime(time), seekTime)
      setRecordingTime(result.duration)
    } catch (error) {
      console.error('Failed to start preview:', error)
    } finally {
      setIsPreviewPlaying(false)
    }
  }

  const stopPreview = () => {
    audioService.stopPlayback()
    setIsPreviewPlaying(false)
    setRecordingTime(previewResult?.duration ?? 0)
  }

  // 继续录音
  const resumeRecording = async () => {
    try {
      console.log('[Button] 继续录音')
      await audioService.resumeRecording()
      setRecordingState('recording')

      // 重新启动录音计时（100ms 精度，与音高数据使用同一时间源）
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(audioService.getRecordingElapsed())
      }, 100)
    } catch (error) {
      console.error('Failed to resume recording:', error)
    }
  }

  // 保存录音
  const saveAndStopRecording = async () => {
    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }

      audioService.stopPlayback()

      // 若已试听（录音已在 startPreview 中停止），直接用缓存结果；否则正常停止
      let result: { audioPath: string; duration: number; pitchData: any }
      if (previewResult) {
        result = previewResult
      } else {
        audioService.setOnPitchDataUpdate(null)
        audioService.setOnMaxDurationReached(null)
        result = await audioService.stopRecording()
      }
      setRecordingState('idle')
      setRecordingDuration(result.duration)

      // 保存录音
      const newRecording: Recording = {
        id: recordingId!,
        name: new Date().toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).replace(/\//g, '-'),
        audioFilePath: result.audioPath,
        pitchDataKey: await savePitchData(recordingId!, result.pitchData),
        duration: result.duration,
        fileSize: 0, // TODO: 获取文件大小
        createTime: new Date().toISOString()
      }

      // 更新录音列表
      const recordings = await loadRecordings()
      recordings.unshift(newRecording)
      await saveRecordings(recordings)

      // 重置状态
      setRecordingId(null)
      setRecordingTime(0)
      setPitchData([])
      setPreviewResult(null)
      setIsPreviewPlaying(false)
      setSeekTime(0)

    } catch (error) {
      console.error('Failed to save recording:', error)
    }
  }

  // 放弃录音
  const discardRecording = async () => {
    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }

      audioService.stopPlayback()

      let audioPathToDelete: string | null = null

      // 若已试听，录音已停止，audioPath 在 previewResult 里
      if (previewResult) {
        audioPathToDelete = previewResult.audioPath
      } else {
        audioService.setOnPitchDataUpdate(null)
        audioService.setOnMaxDurationReached(null)
        // 停止录音但不保存，拿到文件路径
        const result = await audioService.stopRecording()
        audioPathToDelete = result.audioPath
      }

      // 删除音频文件
      if (audioPathToDelete) {
        try {
          const exists = await RNFS.exists(audioPathToDelete)
          if (exists) await RNFS.unlink(audioPathToDelete)
        } catch (e) {
          console.warn('Failed to delete audio file:', e)
        }
      }

      // 重置状态
      setRecordingState('idle')
      setRecordingId(null)
      setRecordingTime(0)
      setPitchData([])
      setPreviewResult(null)
      setIsPreviewPlaying(false)
      setSeekTime(0)

    } catch (error) {
      console.error('Failed to discard recording:', error)
    }
  }

  // 获取当前模式
  const getCurrentMode = () => {
    const allModes = [...PRESET_MODES, ...customModes]
    return allModes.find(m => m.id === currentModeId) || PRESET_MODES[0]
  }

  const currentMode = getCurrentMode()

  // 处理钢琴按键
  const handlePianoKeyPress = (note: string, freq: number) => {
    console.log(`Piano key pressed: ${note} (${freq}Hz)`)
    audioPlayer.playNote(note, 0.5)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* 标题 */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.titleWithIcon}>
          <Ionicons name="musical-note" size={24} color="#9B59B6" style={styles.titleIcon} />
          <Text style={[styles.title, { color: colors.text }]}>实时音准练习</Text>
        </View>
      </View>

      {/* 中间内容区域 - 音高图/钢琴提示 + 控制按钮 */}
      <View style={styles.middleContent}>
        {/* 音高曲线图 - 录音模式显示 */}
        {appMode === 'recording' && (
          <View style={styles.chartContainer} onLayout={e => setChartAreaHeight(e.nativeEvent.layout.height)}>
            <PitchChart
              key={`${currentMode.startNote}-${currentMode.endNote}`}
              data={pitchData}
              minNote={currentMode.startNote}
              maxNote={currentMode.endNote}
              duration={CONFIG.DEFAULT_CHART_DURATION}
              height={chartAreaHeight}
              currentTime={recordingTime}
              paused={recordingState === 'paused'}
              seekable={recordingState === 'paused'}
              onSeekChange={(t) => setSeekTime(t)}
              leftDisplay={leftYAxisDisplay}
              rightDisplay={rightYAxisDisplay}
              showBothYAxes={showBothYAxes}
            />
          </View>
        )}

        {/* 钢琴模式提示 */}
        {appMode === 'piano' && (
          <View style={styles.pianoModeHint}>
            <Text style={styles.pianoModeText}>[P] 钢琴模式</Text>
            <Text style={styles.pianoModeSubtext}>(录音已暂停)</Text>
            <Text style={styles.pianoModeHintText}>(点击钢琴键听参考音)</Text>
          </View>
        )}

        {/* 控制按钮 */}
        <View style={styles.controls}>
          {/* 状态1：空闲（Idle）- 显示开始按钮 */}
          {recordingState === 'idle' && appMode === 'recording' && (
            <TouchableOpacity style={styles.iconButton} onPress={startRecording}>
              <Ionicons name="mic-outline" size={32} color="#FF3B30" />
              <Text style={[styles.iconButtonLabel, { color: '#FF3B30' }]}>开始</Text>
            </TouchableOpacity>
          )}

          {/* 状态2：录音中（Recording）- 显示暂停按钮 */}
          {recordingState === 'recording' && (
            <TouchableOpacity style={styles.iconButton} onPress={pauseRecording}>
              <Ionicons name="pause-circle-outline" size={32} color="#FF9500" />
              <Text style={[styles.iconButtonLabel, { color: '#FF9500' }]}>暂停</Text>
            </TouchableOpacity>
          )}

          {/* 状态3：已暂停（Paused）*/}
          {recordingState === 'paused' && (
            <View style={styles.pausedButtonsContainer}>
              <TouchableOpacity style={styles.iconButton} onPress={discardRecording}>
                <Ionicons name="trash-outline" size={32} color="#FF3B30" />
                <Text style={[styles.iconButtonLabel, { color: '#FF3B30' }]}>放弃</Text>
              </TouchableOpacity>
              {!reachedDurationLimit && (
                <TouchableOpacity style={styles.iconButton} onPress={resumeRecording}>
                  <Ionicons name="mic-outline" size={32} color="#FF9500" />
                  <Text style={[styles.iconButtonLabel, { color: '#FF9500' }]}>继续</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.iconButton} onPress={saveAndStopRecording}>
                <Ionicons name="checkmark-circle-outline" size={32} color="#34C759" />
                <Text style={[styles.iconButtonLabel, { color: '#34C759' }]}>保存</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>

        {/* 虚拟钢琴 */}
        <View style={[styles.pianoSection, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.pianoHeader, { backgroundColor: colors.surface }]}
            onPress={() => setPianoExpanded(!pianoExpanded)}
          >
            <Text style={[styles.pianoHeaderText, { color: colors.text }]}>
              {pianoExpanded ? '▼' : '▲'} 虚拟钢琴（{currentMode.name}）
            </Text>
          </TouchableOpacity>

          {pianoExpanded && (
            <View style={styles.pianoWrapper}>
              <Piano
                startNote={currentMode.startNote}
                endNote={currentMode.endNote}
                disabled={appMode === 'recording' && recordingState === 'recording'}
                onKeyPress={handlePianoKeyPress}
              />
              {appMode === 'recording' && recordingState === 'recording' && (
                <TouchableOpacity
                  style={styles.pianoDisabledHintOverlay}
                  onPress={handleDoubleTap}
                  activeOpacity={1}
                >
                  <View style={styles.pianoDisabledHint}>
                    <Text style={styles.pianoDisabledHintText}>
                      [R] 录音中
                    </Text>
                    <Text style={styles.pianoDisabledHintSubtext}>
                      双击暂停录音，激活钢琴
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center'
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  titleIcon: {
    marginRight: 8
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold'
  },
  middleContent: {
    flex: 1,
    flexDirection: 'column'
  },
  chartContainer: { flex: 1, minHeight: 0 },
  pianoModeHint: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  pianoModeText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8
  },
  pianoModeSubtext: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8
  },
  pianoModeHintText: {
    fontSize: 14,
    color: '#999'
  },
  controls: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 70,
    flexShrink: 0
  },
  controlButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center'
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500'
  },
  recordButton: {
    backgroundColor: '#FF3B30'
  },
  pauseButton: {
    backgroundColor: '#FF9500'
  },
  pausedButtonsContainer: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'center',
  },
  iconButton: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  iconButtonLabel: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  pausedButton: {
    backgroundColor: '#007AFF'
  },
  resumeButton: {
    backgroundColor: '#FF9500'
  },
  saveButton: {
    backgroundColor: '#34C759'
  },
  discardButton: {
    backgroundColor: '#FF3B30'
  },
  pianoSection: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexShrink: 0
  },
  pianoHeader: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center'
  },
  pianoHeaderText: {
    fontSize: 16,
    fontWeight: '500'
  },
  pianoWrapper: {
    position: 'relative'
  },
  pianoDisabledHintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100
  },
  pianoDisabledHint: {
    backgroundColor: '#FFF3CD',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center'
  },
  pianoDisabledHintText: {
    fontSize: 16,
    color: '#856404',
    fontWeight: '500',
    marginBottom: 4
  },
  pianoDisabledHintSubtext: {
    fontSize: 12,
    color: '#856404'
  }
})
