import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActionSheetIOS, ActivityIndicator, Modal, PanResponder } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import RNFS from 'react-native-fs'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { PitchTemplate, PitchData, PitchDataPoint, Recording } from '../types'
import { loadTemplates, addTemplate, deleteTemplate, saveTemplatePitchData, updateTemplate, loadTemplatePitchData, resolveTemplateAudioPath, createTemplateFromRecording } from '../services/templateStorage'
import { pickAudioFile, copyAudioFileToImports, getAudioDuration } from '../services/documentPicker'
import { loadRecordings } from '../services/storage'
import { nativePitchRecorder } from '../services/nativePitchRecorder'
import { audioService } from '../services/audio'
import { freqToMidi, midiToNoteName } from '../utils/noteUtils'
import { useTheme } from '../context/ThemeContext'
import { PlaybackPitchChart } from '../components/PlaybackPitchChart'

const MAX_DURATION = 600 // 10 分钟

export function TemplatesScreen({ navigation, route }: any) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [templates, setTemplates] = useState<PitchTemplate[]>([])
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 播放器状态
  const [viewingTemplate, setViewingTemplate] = useState<PitchTemplate | null>(null)
  const [viewingPitchData, setViewingPitchData] = useState<PitchDataPoint[]>([])
  const [viewingNoteRange, setViewingNoteRange] = useState({ minNote: 'C3', maxNote: 'C6' })
  const [pitchLoading, setPitchLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [chartAreaHeight, setChartAreaHeight] = useState(0)

  // seek 进度条 refs
  const isPlayingRef = useRef(isPlaying)
  const viewingTemplateRef = useRef(viewingTemplate)
  const trackWidthRef = useRef(0)
  const seekStartXRef = useRef(0)
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { viewingTemplateRef.current = viewingTemplate }, [viewingTemplate])

  const seekPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !isPlayingRef.current,
    onMoveShouldSetPanResponder: () => !isPlayingRef.current,
    onPanResponderGrant: (e) => {
      if (trackWidthRef.current <= 0) return
      seekStartXRef.current = e.nativeEvent.locationX
      const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidthRef.current))
      const t = ratio * (viewingTemplateRef.current?.duration ?? 0)
      setCurrentTime(t)
      audioService.seekTo(t)
    },
    onPanResponderMove: (_, { dx }) => {
      if (trackWidthRef.current <= 0) return
      const x = seekStartXRef.current + dx
      const ratio = Math.max(0, Math.min(1, x / trackWidthRef.current))
      const t = ratio * (viewingTemplateRef.current?.duration ?? 0)
      setCurrentTime(t)
      audioService.seekTo(t)
    },
  })).current

  // 卸载时停止播放
  useEffect(() => {
    return () => { audioService.stopPlayback() }
  }, [])

  const loadList = async () => {
    const list = await loadTemplates()
    setTemplates(list)
  }

  useEffect(() => { loadList() }, [])

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      const pickedId = route.params?.pickedRecordingId
      if (pickedId) {
        navigation.setParams({ pickedRecordingId: undefined })
        try {
          const recordings = await loadRecordings()
          const recording = recordings.find((r: Recording) => r.id === pickedId)
          if (recording) await createTemplateFromRecording(recording)
        } catch (error: any) {
          Alert.alert('创建失败', error?.message ?? String(error))
        }
      }
      await loadList()
    })
    return unsubscribe
  }, [navigation, route])

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
    if (next.size === 0) setIsSelectionMode(false)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === templates.length) {
      setSelectedIds(new Set())
      setIsSelectionMode(false)
    } else {
      setSelectedIds(new Set(templates.map(t => t.id)))
    }
  }

  const exitSelectionMode = () => {
    setSelectedIds(new Set())
    setIsSelectionMode(false)
  }

  const importFromFile = async () => {
    try {
      const srcPath = await pickAudioFile()
      if (!srcPath) return

      // 重名检查：询问是否替换
      const srcFileName = srcPath.split('/').pop() ?? ''
      const existing = templates.find(t => t.sourceFileName === srcFileName)
      if (existing) {
        const replace = await new Promise<boolean>((resolve) => {
          Alert.alert(
            '已存在同名模板',
            `"${srcFileName}" 已在列表中，是否替换？`,
            [
              { text: '取消', style: 'cancel', onPress: () => resolve(false) },
              { text: '替换', style: 'destructive', onPress: () => resolve(true) },
            ]
          )
        })
        if (!replace) return
        await deleteTemplate(existing)
        await loadList()
      }

      const duration = await getAudioDuration(srcPath)

      if (duration > MAX_DURATION) {
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            '音频过长',
            '该音频时长超过 10 分钟，仅支持导入前 10 分钟，是否继续？',
            [
              { text: '取消', style: 'cancel', onPress: () => resolve(false) },
              { text: '继续', onPress: () => resolve(true) },
            ]
          )
        })
        if (!confirmed) return
      }

      setImporting(true)
      setImportStatus('复制中...')
      const destPath = await copyAudioFileToImports(srcPath)
      const filename = destPath.split('/').pop() ?? destPath
      const displayName = filename.replace(/_\d+(\.\w+)$/, '$1')
      const nameWithoutExt = displayName.replace(/\.\w+$/, '')
      const templateId = `${Date.now()}_${Math.random().toString(36).slice(2)}`

      const template: PitchTemplate = {
        id: templateId,
        name: nameWithoutExt,
        sourceFileName: displayName,
        audioFilePath: filename,
        audioSource: 'file',
        pitchDataKey: '',
        duration: Math.min(duration, MAX_DURATION),
        createTime: new Date().toISOString(),
      }

      await addTemplate(template)
      await loadList()

      setImportStatus('分析音高...')
      const result = await nativePitchRecorder.analyzeAudioFile(destPath)
      const pitchData: PitchData = {
        version: 1,
        duration: result.duration,
        data: result.points.map(p => ({
          time: p.time,
          freq: p.freq,
          note: p.freq > 0 ? midiToNoteName(freqToMidi(p.freq)) : null,
        })),
      }
      const pitchDataKey = await saveTemplatePitchData(templateId, pitchData)
      const validMidis = pitchData.data.filter(p => p.freq > 0).map(p => freqToMidi(p.freq))
      const minNote = validMidis.length > 0 ? midiToNoteName(Math.max(21, Math.round(Math.min(...validMidis)) - 3)) : undefined
      const maxNote = validMidis.length > 0 ? midiToNoteName(Math.min(108, Math.round(Math.max(...validMidis)) + 3)) : undefined
      await updateTemplate({ ...template, pitchDataKey, minNote, maxNote })
      await loadList()
    } catch (error: any) {
      Alert.alert('导入失败', error?.message ?? String(error))
    } finally {
      setImporting(false)
      setImportStatus('')
    }
  }

  const onAddPress = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['取消', '从文件导入', '从录音历史选择'], cancelButtonIndex: 0 },
      (index) => {
        if (index === 1) importFromFile()
        else if (index === 2) navigation.navigate('Recordings', { pickMode: true })
      }
    )
  }

  const renameTemplate = (template: PitchTemplate) => {
    Alert.prompt(
      '重命名',
      '请输入新名称',
      async (newName) => {
        const trimmed = newName?.trim()
        if (!trimmed || trimmed === template.name) return
        await updateTemplate({ ...template, name: trimmed })
        await loadList()
      },
      'plain-text',
      template.name,
    )
  }

  const onDeletePress = (template: PitchTemplate) => {
    Alert.alert('确认删除', `确定要删除模板"${template.name}"吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          await deleteTemplate(template)
          await loadList()
        }
      }
    ])
  }

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return
    Alert.alert('确认删除', `确定要删除选中的 ${selectedIds.size} 个模板吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          for (const id of Array.from(selectedIds)) {
            const t = templates.find(t => t.id === id)
            if (t) await deleteTemplate(t)
          }
          setSelectedIds(new Set())
          setIsSelectionMode(false)
          await loadList()
        }
      }
    ])
  }

  const openTemplateViewer = async (template: PitchTemplate) => {
    audioService.stopPlayback()
    setViewingTemplate(template)
    setViewingPitchData([])
    setViewingNoteRange({ minNote: 'C3', maxNote: 'C6' })
    setIsPlaying(false)
    setCurrentTime(0)
    setChartAreaHeight(0)
    setPitchLoading(true)
    try {
      const loaded = await loadTemplatePitchData(template.pitchDataKey)
      if (loaded && loaded.data.length > 0) {
        const midis = loaded.data.filter(p => p.freq > 0).map(p => freqToMidi(p.freq))
        if (midis.length > 0) {
          const minMidi = Math.max(21, midis.reduce((a, b) => Math.min(a, b)) - 3)
          const maxMidi = Math.min(108, midis.reduce((a, b) => Math.max(a, b)) + 3)
          setViewingNoteRange({ minNote: midiToNoteName(minMidi), maxNote: midiToNoteName(maxMidi) })
        }
        setViewingPitchData(loaded.data)
      }
    } finally {
      setPitchLoading(false)
    }
  }

  const closeViewer = () => {
    audioService.stopPlayback()
    setViewingTemplate(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setViewingPitchData([])
  }

  const startAudio = async (template: PitchTemplate) => {
    setIsPlaying(true)
    try {
      const fullPath = await resolveTemplateAudioPath(template)
      await audioService.playAudio(fullPath, (time) => setCurrentTime(time))
    } catch (error: any) {
      Alert.alert('播放失败', error?.message ?? String(error))
    } finally {
      setIsPlaying(false)
      setCurrentTime(0)
    }
  }

  const togglePlayPause = async () => {
    if (isPlaying) {
      audioService.pausePlayback()
      setIsPlaying(false)
    } else if (audioService.hasPlayback()) {
      setIsPlaying(true)
      audioService.resumePlayback((time) => setCurrentTime(time))
    } else if (viewingTemplate) {
      setCurrentTime(0)
      await startAudio(viewingTemplate)
    }
  }

  const onItemPress = (template: PitchTemplate) => {
    if (isSelectionMode) { toggleSelection(template.id); return }
    openTemplateViewer(template)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {isSelectionMode ? (
          <>
            <TouchableOpacity onPress={exitSelectionMode}>
              <Text style={styles.headerAction}>取消</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>已选 {selectedIds.size} 个</Text>
            <TouchableOpacity onPress={toggleSelectAll}>
              <Text style={styles.headerAction}>
                {selectedIds.size === templates.length ? '全不选' : '全选'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={{ width: 60 }} />
            <View style={styles.titleWithIcon}>
              <Ionicons name="layers-outline" size={22} color="#FF9500" style={styles.titleIcon} />
              <Text style={[styles.title, { color: colors.text }]}>模板</Text>
            </View>
            {templates.length > 0 ? (
              <TouchableOpacity onPress={() => setIsSelectionMode(true)}>
                <Text style={styles.headerAction}>选择</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 60 }} />
            )}
          </>
        )}
      </View>

      {/* 导入状态条 */}
      {importStatus ? (
        <View style={[styles.statusBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <ActivityIndicator size="small" color="#007AFF" style={{ marginRight: 8 }} />
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{importStatus}</Text>
        </View>
      ) : null}

      {/* 列表 */}
      {templates.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="layers-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>暂无模板</Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>点击右下角 + 导入音频</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator>
          {templates.map((template) => (
            <TouchableOpacity
              key={template.id}
              style={[
                styles.item,
                { backgroundColor: colors.surface, borderBottomColor: colors.border },
                isSelectionMode && selectedIds.has(template.id) && styles.itemSelected,
              ]}
              onPress={() => onItemPress(template)}
              activeOpacity={0.7}
            >
              {isSelectionMode && (
                <View style={[styles.checkbox, selectedIds.has(template.id) && styles.checkboxSelected]}>
                  {selectedIds.has(template.id) && <Text style={styles.checkmark}>✓</Text>}
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: colors.text }]} onLongPress={() => renameTemplate(template)}>♪ {template.name}</Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  时长: {formatDuration(template.duration)} · {template.sourceFileName}
                </Text>
              </View>
              {!isSelectionMode && (
                <View style={styles.itemActions}>
                  <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => onDeletePress(template)}>
                    <Text style={styles.actionButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 批量删除底部栏 */}
      {isSelectionMode && selectedIds.size > 0 && (
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity style={styles.deleteAllButton} onPress={deleteSelected}>
            <Text style={styles.deleteAllButtonText}>删除选中 ({selectedIds.size})</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FAB：非选择模式时显示 */}
      {!isSelectionMode && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 24 }]}
          onPress={onAddPress}
          disabled={importing}
          activeOpacity={0.8}
        >
          {importing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="add" size={32} color="#fff" />
          }
        </TouchableOpacity>
      )}

      {/* 模板播放 Modal */}
      <Modal
        visible={viewingTemplate !== null}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeViewer}
      >
        <View style={[styles.playerContainer, { backgroundColor: colors.background }]}>
          {/* 顶栏 */}
          <View style={[styles.playerHeader, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
            <View style={{ width: 64 }} />
            <Text style={[styles.playerTitle, { color: colors.text }]} numberOfLines={1}>
              {viewingTemplate?.name ?? ''}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={closeViewer}>
              <Text style={[styles.closeLabel, { color: colors.textSecondary }]}>收起</Text>
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* 音高曲线区域 */}
          <View style={{ flex: 1 }} onLayout={(e) => setChartAreaHeight(e.nativeEvent.layout.height)}>
            {pitchLoading ? (
              <View style={styles.chartPlaceholder}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={{ color: colors.textSecondary, marginTop: 12 }}>加载音高数据...</Text>
              </View>
            ) : viewingPitchData.length === 0 ? (
              <View style={styles.chartPlaceholder}>
                <Ionicons name="analytics-outline" size={48} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12 }}>暂无音高数据</Text>
              </View>
            ) : chartAreaHeight > 0 ? (
              <PlaybackPitchChart
                data={viewingPitchData}
                minNote={viewingNoteRange.minNote}
                maxNote={viewingNoteRange.maxNote}
                totalDuration={viewingTemplate?.duration ?? 0}
                currentTime={currentTime}
                isPlaying={isPlaying}
                height={chartAreaHeight}
                onSeek={(t) => { setCurrentTime(t); audioService.seekTo(t) }}
              />
            ) : null}
          </View>

          {/* 底部播放控件 */}
          <View style={[styles.playerControls, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <View style={styles.progressRow}>
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatDuration(Math.floor(currentTime))}</Text>
              {(() => {
                const fillPercent = Math.min(100, (currentTime / Math.max(1, viewingTemplate?.duration ?? 1)) * 100)
                const thumbLeft = trackWidthRef.current > 0 ? (fillPercent / 100) * trackWidthRef.current - 7 : -7
                return (
                  <View
                    style={styles.progressTrackWrapper}
                    onLayout={e => { trackWidthRef.current = e.nativeEvent.layout.width }}
                    {...seekPanResponder.panHandlers}
                  >
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFill, { width: `${fillPercent}%` }]} />
                    </View>
                    <View style={[styles.progressThumb, { left: thumbLeft }]} />
                  </View>
                )
              })()}
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatDuration(viewingTemplate?.duration ?? 0)}</Text>
            </View>
            <TouchableOpacity style={styles.playPauseButton} onPress={togglePlayPause}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1,
  },
  headerAction: { fontSize: 16, color: '#007AFF', width: 60 },
  title: { fontSize: 18, fontWeight: 'bold' },
  titleWithIcon: { flexDirection: 'row', alignItems: 'center' },
  titleIcon: { marginRight: 6 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1,
  },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, marginBottom: 6 },
  emptyHint: { fontSize: 14 },
  list: { flex: 1 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderBottomWidth: 1,
  },
  itemSelected: { backgroundColor: '#E3F2FD' },
  checkbox: {
    width: 24, height: 24, borderWidth: 2, borderColor: '#007AFF',
    borderRadius: 4, marginRight: 12, justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: '#007AFF' },
  checkmark: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '500', marginBottom: 4 },
  itemMeta: { fontSize: 14 },
  itemActions: { flexDirection: 'row', gap: 12 },
  actionButton: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f0f0f0', borderRadius: 8 },
  deleteButton: { backgroundColor: '#FFE5E5' },
  actionButtonText: { fontSize: 16 },
  bottomBar: { padding: 16, borderTopWidth: 1 },
  deleteAllButton: { backgroundColor: '#FF3B30', padding: 16, borderRadius: 8, alignItems: 'center' },
  deleteAllButtonText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  fab: {
    position: 'absolute', right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  // 播放器 Modal
  playerContainer: { flex: 1 },
  playerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  playerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  closeButton: { flexDirection: 'row', alignItems: 'center', width: 64, justifyContent: 'flex-end' },
  closeLabel: { fontSize: 15, marginRight: 2 },
  chartPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  playerControls: {
    paddingTop: 12, paddingHorizontal: 20, borderTopWidth: 1, alignItems: 'center',
  },
  progressRow: {
    flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 16,
  },
  timeText: { fontSize: 13, width: 40, textAlign: 'center' },
  progressTrackWrapper: { flex: 1, height: 30, justifyContent: 'center', marginHorizontal: 4 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#007AFF', borderRadius: 2 },
  progressThumb: {
    position: 'absolute', top: '50%', marginTop: -7,
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#007AFF',
  },
  playPauseButton: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center',
  },
})
