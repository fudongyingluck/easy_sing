import React, { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { PitchChart } from '../components/PitchChart'
import { Piano } from '../components/Piano'
import { audioService } from '../services/audio'
import { audioPlayer } from '../utils/audioUtils'
import { loadUserSettings, saveUserSettings, saveRecordings, savePitchData, getRecordingPath, getPitchDataPath, loadRecordings } from '../services/storage'
import { UserSettings, AppMode, RecordingState, Recording } from '../types'
import { PRESET_MODES, CONFIG } from '../config/constants'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

export function PracticeScreen({ navigation }: any) {
  const [appMode, setAppMode] = useState<AppMode>('recording')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [currentModeId, setCurrentModeId] = useState<string>('female')
  const [customModes, setCustomModes] = useState<any[]>([])
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [pitchData, setPitchData] = useState<any[]>([])
  const [recordingTime, setRecordingTime] = useState(0)
  const [pianoExpanded, setPianoExpanded] = useState(true)
  const [hasSavedRecording, setHasSavedRecording] = useState(false)
  const [chartAreaHeight, setChartAreaHeight] = useState(SCREEN_HEIGHT * 5 / 12)

  const recordingTimerRef = useRef<any>(null)
  const lastTapTimeRef = useRef<number>(0)

  // 加载用户设置
  useEffect(() => {
    const loadData = async () => {
      const settings = await loadUserSettings()
      setCurrentModeId(settings.currentModeId)
      setCustomModes(settings.customModes)
    }
    loadData()
  }, [])

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
      setPitchData([])

      // 设置音高数据更新回调
      audioService.setOnPitchDataUpdate((data) => {
        setPitchData(data)
      })

      // 设置最大时长到达回调
      audioService.setOnMaxDurationReached(() => {
        pauseRecording()
      })

      const id = await audioService.startRecording()
      setRecordingId(id)
      setRecordingState('recording')
      setRecordingTime(0)

      // 启动录音计时
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
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

  // 继续录音
  const resumeRecording = async () => {
    try {
      await audioService.resumeRecording()
      setRecordingState('recording')

      // 重新启动录音计时
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
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

      // 清除音高数据回调
      audioService.setOnPitchDataUpdate(null)
      audioService.setOnMaxDurationReached(null)

      const result = await audioService.stopRecording()
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
        pitchDataPath: await savePitchData(recordingId!, result.pitchData),
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
      setHasSavedRecording(true)
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

      // 清除音高数据回调
      audioService.setOnPitchDataUpdate(null)
      audioService.setOnMaxDurationReached(null)

      // 停止录音但不保存
      await audioService.stopRecording()

      // 重置状态
      setRecordingState('idle')
      setRecordingId(null)
      setRecordingTime(0)
      setPitchData([])
      setHasSavedRecording(false)
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
    <SafeAreaView style={styles.container}>
      {/* 标题 */}
      <View style={styles.header}>
        <View style={styles.titleWithIcon}>
          <Ionicons name="musical-note" size={24} color="#9B59B6" style={styles.titleIcon} />
          <Text style={styles.title}>实时音准练习</Text>
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
          {recordingState === 'idle' && !hasSavedRecording && appMode === 'recording' && (
            <TouchableOpacity style={[styles.controlButton, styles.recordButton]} onPress={startRecording}>
              <Text style={styles.controlButtonText}>开始</Text>
            </TouchableOpacity>
          )}

          {/* 状态2：录音中（Recording）- 显示暂停按钮 */}
          {recordingState === 'recording' && (
            <TouchableOpacity style={[styles.controlButton, styles.pauseButton]} onPress={pauseRecording}>
              <Text style={styles.controlButtonText}>暂停</Text>
            </TouchableOpacity>
          )}

          {/* 状态3：已暂停（Paused）- 显示三个按钮：继续、保存、放弃 */}
          {recordingState === 'paused' && (
            <View style={styles.pausedButtonsContainer}>
              <TouchableOpacity style={[styles.controlButton, styles.pausedButton]} onPress={resumeRecording}>
                <Text style={styles.controlButtonText}>继续</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.controlButton, styles.saveButton]} onPress={saveAndStopRecording}>
                <Text style={styles.controlButtonText}>保存</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.controlButton, styles.discardButton]} onPress={discardRecording}>
                <Text style={styles.controlButtonText}>放弃</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 状态4：已保存（Stopped）- 显示重新按钮 */}
          {recordingState === 'idle' && hasSavedRecording && (
            <TouchableOpacity style={[styles.controlButton, styles.recordButton]} onPress={() => {
              setHasSavedRecording(false)
              startRecording()
            }}>
              <Text style={styles.controlButtonText}>重新</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 虚拟钢琴 */}
        <View style={styles.pianoSection}>
          <TouchableOpacity
            style={styles.pianoHeader}
            onPress={() => setPianoExpanded(!pianoExpanded)}
          >
            <Text style={styles.pianoHeaderText}>
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
    gap: 12
  },
  pausedButton: {
    backgroundColor: '#007AFF'
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
