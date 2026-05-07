import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Modal, NativeModules, NativeEventEmitter } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { PitchChart } from '../components/PitchChart'
import { Piano } from '../components/Piano'
import { audioPlayer } from '../utils/audioUtils'
import { loadUserSettings } from '../services/storage'
import { AppMode } from '../types'
import { PRESET_MODES, CONFIG } from '../config/constants'
import { useDoubleTap } from '../utils/doubleTap'
import { useTheme } from '../context/ThemeContext'
import { useRecording } from '../hooks/useRecording'
import { useTemplateAudio } from '../hooks/useTemplateAudio'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

export function PracticeScreen({ navigation }: any) {
  const { colors } = useTheme()

  // ── User settings ─────────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState<AppMode>('recording')
  const [currentModeId, setCurrentModeId] = useState<string>('female')
  const [customModes, setCustomModes] = useState<any[]>([])
  const [leftYAxisDisplay, setLeftYAxisDisplay] = useState<'english' | 'solfege' | 'number'>('english')
  const [rightYAxisDisplay, setRightYAxisDisplay] = useState<'english' | 'solfege' | 'number'>('english')
  const [showBothYAxes, setShowBothYAxes] = useState(true)
  const [recordingDurationLimit, setRecordingDurationLimit] = useState(600)
  const [pitchDetectionRate, setPitchDetectionRate] = useState<number>(100)
  const [rememberLastTemplate, setRememberLastTemplate] = useState(false)
  const [pianoExpanded, setPianoExpanded] = useState(true)
  const [chartAreaHeight, setChartAreaHeight] = useState(SCREEN_HEIGHT * 5 / 12)

  // ── Template audio ─────────────────────────────────────────────────────────
  const templateAudio = useTemplateAudio({ currentModeId, customModes })

  // ── Recording ──────────────────────────────────────────────────────────────
  const recording = useRecording({
    recordingDurationLimit,
    pitchDetectionRate,
    hasTemplate: !!templateAudio.selectedTemplate,
    onAfterStart: () => {
      if (templateAudio.selectedTemplate) {
        templateAudio.startTemplateAudio(templateAudio.selectedTemplate)
      }
    },
    onPause: templateAudio.pauseTemplateAudio,
    onResume: templateAudio.resumeTemplateAudio,
    onStop: templateAudio.stopTemplateSound,
  })

  // ── Headphones disconnected ────────────────────────────────────────────────
  useEffect(() => {
    const emitter = new NativeEventEmitter(NativeModules.AudioSessionModule)
    const sub = emitter.addListener('onHeadphonesDisconnected', () => {
      audioPlayer.stopAll()
      templateAudio.pauseTemplateAudio()
    })
    return () => sub.remove()
  }, [templateAudio.pauseTemplateAudio])

  // ── Unmount cleanup ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      recording.cleanup()
      templateAudio.stopTemplateSound()
    }
  }, [])

  // ── Settings + focus listener ──────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      const settings = await loadUserSettings()
      setCurrentModeId(settings.currentModeId)
      setCustomModes(settings.customModes)
      setLeftYAxisDisplay(settings.leftYAxisDisplay)
      setRightYAxisDisplay(settings.rightYAxisDisplay)
      setShowBothYAxes(settings.showBothYAxes)
      setRecordingDurationLimit(settings.recordingDurationLimit)
      setPitchDetectionRate(settings.pitchDetectionRate)
      setRememberLastTemplate(settings.rememberLastTemplate)
    }
    loadData()
    const unsubscribeFocus = navigation.addListener('focus', async () => {
      loadData()
      await templateAudio.reloadTemplates(templateAudio.selectedTemplate)
    })
    const unsubscribeBlur = navigation.addListener('blur', () => {
      if (recording.recordingState === 'recording') recording.pauseRecording()
    })
    return () => { unsubscribeFocus(); unsubscribeBlur() }
  }, [navigation, recording.recordingState])

  // ── Save: reset template if not remembered ─────────────────────────────────
  const saveAndStop = useCallback(async () => {
    await recording.saveAndStopRecording()
    if (!rememberLastTemplate) templateAudio.resetTemplate()
  }, [recording.saveAndStopRecording, rememberLastTemplate, templateAudio.resetTemplate])

  // ── App mode ───────────────────────────────────────────────────────────────
  const toggleAppMode = useCallback(() => {
    if (appMode === 'recording') {
      if (recording.recordingState === 'recording') recording.pauseRecording()
      setAppMode('piano')
    } else {
      if (recording.recordingState === 'paused') recording.resumeRecording()
      setAppMode('recording')
    }
  }, [appMode, recording.recordingState, recording.pauseRecording, recording.resumeRecording])

  // ── Double tap ─────────────────────────────────────────────────────────────
  const { handleTap: handleDoubleTap } = useDoubleTap(
    useCallback(() => {
      if (recording.recordingState === 'recording') {
        recording.pauseRecording()
      } else {
        toggleAppMode()
      }
    }, [recording.recordingState, recording.pauseRecording, toggleAppMode])
  )

  const handleRangeAreaTap = handleDoubleTap

  // ── Current mode ───────────────────────────────────────────────────────────
  const currentMode = [...PRESET_MODES, ...customModes].find(m => m.id === currentModeId) || PRESET_MODES[0]

  const handlePianoKeyPress = (note: string, _freq: number) => {
    audioPlayer.playNote(note)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* 标题 */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ width: 60 }} />
        <View style={styles.titleWithIcon}>
          <Ionicons name="musical-notes" size={24} color="#9B59B6" style={styles.titleIcon} />
          <Text style={[styles.title, { color: colors.text }]}>实时音准练习</Text>
        </View>
        <TouchableOpacity onPress={templateAudio.openTemplateModal} disabled={recording.recordingState !== 'idle'}>
          <Text style={[styles.templateButtonText, { color: recording.recordingState !== 'idle' ? colors.textSecondary : templateAudio.selectedTemplate ? '#FF9500' : '#007AFF' }]} numberOfLines={1}>
            {templateAudio.selectedTemplate ? (templateAudio.selectedTemplate.name.length > 4 ? templateAudio.selectedTemplate.name.slice(0, 4) + '…' : templateAudio.selectedTemplate.name) : '无模板'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.middleContent}>
        {/* 音高曲线图 */}
        {appMode === 'recording' && (
          <View style={styles.chartContainer} onLayout={e => setChartAreaHeight(e.nativeEvent.layout.height)}>
            <PitchChart
              key={`${currentMode.startNote}-${currentMode.endNote}`}
              data={recording.pitchData}
              templateData={templateAudio.templatePitchData.length > 0 ? templateAudio.templatePitchData : undefined}
              minNote={currentMode.startNote}
              maxNote={currentMode.endNote}
              duration={CONFIG.DEFAULT_CHART_DURATION}
              height={chartAreaHeight}
              currentTime={recording.recordingTime}
              paused={recording.recordingState === 'paused'}
              seekable={recording.recordingState === 'paused'}
              totalDuration={recordingDurationLimit > 0 ? recordingDurationLimit : 0}
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
          {recording.recordingState === 'idle' && appMode === 'recording' && (
            <TouchableOpacity style={styles.iconButton} onPress={recording.startRecording}>
              <Ionicons name="mic-outline" size={32} color="#FF3B30" />
              <Text style={[styles.iconButtonLabel, { color: '#FF3B30' }]}>开始</Text>
            </TouchableOpacity>
          )}

          {recording.recordingState === 'recording' && (
            <TouchableOpacity style={styles.iconButton} onPress={recording.pauseRecording}>
              <Ionicons name="pause-circle-outline" size={32} color="#FF9500" />
              <Text style={[styles.iconButtonLabel, { color: '#FF9500' }]}>暂停</Text>
            </TouchableOpacity>
          )}

          {recording.recordingState === 'paused' && (
            <View style={styles.pausedButtonsContainer}>
              <TouchableOpacity style={styles.iconButton} onPress={recording.discardRecording}>
                <Ionicons name="trash-outline" size={32} color="#FF3B30" />
                <Text style={[styles.iconButtonLabel, { color: '#FF3B30' }]}>放弃</Text>
              </TouchableOpacity>
              {!recording.reachedDurationLimit && (
                <TouchableOpacity style={styles.iconButton} onPress={recording.resumeRecording}>
                  <Ionicons name="mic-outline" size={32} color="#FF9500" />
                  <Text style={[styles.iconButtonLabel, { color: '#FF9500' }]}>继续</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.iconButton} onPress={saveAndStop}>
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
                disabled={appMode === 'recording' && recording.recordingState === 'recording'}
                onKeyPress={handlePianoKeyPress}
              />
              {appMode === 'recording' && recording.recordingState === 'recording' && (
                <TouchableOpacity
                  style={styles.pianoDisabledHintOverlay}
                  onPress={handleDoubleTap}
                  activeOpacity={1}
                >
                  <View style={styles.pianoDisabledHint}>
                    <Text style={styles.pianoDisabledHintText}>[R] 录音中</Text>
                    <Text style={styles.pianoDisabledHintSubtext}>双击暂停录音，激活钢琴</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>

      {/* 模板选择 Modal */}
      <Modal visible={templateAudio.templateModalVisible} animationType="slide" transparent onRequestClose={() => templateAudio.setTemplateModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => templateAudio.setTemplateModalVisible(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <Text style={[styles.modalSheetTitle, { color: colors.text }]}>选择模板</Text>
            {templateAudio.templates.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>暂无模板，请先到「模板」页导入</Text>
                <TouchableOpacity onPress={() => { templateAudio.setTemplateModalVisible(false); navigation.navigate('Templates') }}>
                  <Text style={{ color: '#007AFF', fontSize: 15 }}>前往模板页 →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView>
                <TouchableOpacity style={[styles.modalItem, { borderBottomColor: colors.border }]} onPress={() => templateAudio.selectTemplate(null)}>
                  <Text style={[styles.modalItemText, { color: templateAudio.selectedTemplate ? colors.text : '#007AFF' }]}>不使用模板</Text>
                  {!templateAudio.selectedTemplate && <Ionicons name="checkmark" size={20} color="#007AFF" />}
                </TouchableOpacity>
                {templateAudio.templates.map(t => (
                  <TouchableOpacity key={t.id} style={[styles.modalItem, { borderBottomColor: colors.border }]} onPress={() => templateAudio.selectTemplate(t)}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalItemText, { color: templateAudio.selectedTemplate?.id === t.id ? '#FF9500' : colors.text }]}>♪ {t.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t.sourceFileName}</Text>
                    </View>
                    {templateAudio.selectedTemplate?.id === t.id && <Ionicons name="checkmark" size={20} color="#FF9500" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  templateButtonText: { fontSize: 16, width: 60, textAlign: 'right' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, paddingTop: 16, maxHeight: '60%',
  },
  modalSheetTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  modalEmpty: { padding: 24, alignItems: 'center' },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  modalItemText: { fontSize: 16, fontWeight: '500' },
  titleWithIcon: { flexDirection: 'row', alignItems: 'center' },
  titleIcon: { marginRight: 8 },
  title: { fontSize: 20, fontWeight: 'bold' },
  middleContent: { flex: 1, flexDirection: 'column' },
  chartContainer: { flex: 1, minHeight: 0 },
  pianoModeHint: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  pianoModeText: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  pianoModeSubtext: { fontSize: 16, color: '#666', marginBottom: 8 },
  pianoModeHintText: { fontSize: 14, color: '#999' },
  controls: {
    paddingTop: 8, paddingBottom: 16, paddingHorizontal: 16,
    justifyContent: 'center', alignItems: 'center', minHeight: 70, flexShrink: 0,
  },
  pausedButtonsContainer: { flexDirection: 'row', gap: 24, alignItems: 'center' },
  iconButton: { alignItems: 'center', paddingHorizontal: 8 },
  iconButtonLabel: { fontSize: 11, marginTop: 4, fontWeight: '500' },
  pianoSection: { borderTopWidth: 1, borderTopColor: '#eee', flexShrink: 0 },
  pianoHeader: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f5f5f5', alignItems: 'center' },
  pianoHeaderText: { fontSize: 16, fontWeight: '500' },
  pianoWrapper: { position: 'relative' },
  pianoDisabledHintOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 150,
    backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 100,
  },
  pianoDisabledHint: { backgroundColor: '#FFF3CD', padding: 16, borderRadius: 8, alignItems: 'center' },
  pianoDisabledHintText: { fontSize: 16, color: '#856404', fontWeight: '500', marginBottom: 4 },
  pianoDisabledHintSubtext: { fontSize: 12, color: '#856404' },
  // legacy unused styles kept to avoid JSX-side errors
  controlButton: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  controlButtonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  recordButton: { backgroundColor: '#FF3B30' },
  pauseButton: { backgroundColor: '#FF9500' },
  pausedButton: { backgroundColor: '#007AFF' },
  resumeButton: { backgroundColor: '#FF9500' },
  saveButton: { backgroundColor: '#34C759' },
  discardButton: { backgroundColor: '#FF3B30' },
})
