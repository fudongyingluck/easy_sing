import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActionSheetIOS, ActivityIndicator, Modal } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { PitchTemplate, PitchData, PitchDataPoint } from '../types'
import { loadTemplates, addTemplate, deleteTemplate, saveTemplatePitchData, updateTemplate, loadTemplatePitchData } from '../services/templateStorage'
import { pickAudioFile, copyAudioFileToImports, getAudioDuration } from '../services/documentPicker'
import { nativePitchRecorder } from '../services/nativePitchRecorder'
import { freqToMidi, midiToNoteName } from '../utils/noteUtils'
import { useTheme } from '../context/ThemeContext'
import { PlaybackPitchChart } from '../components/PlaybackPitchChart'

const MAX_DURATION = 600 // 10 分钟

export function TemplatesScreen({ navigation }: any) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [templates, setTemplates] = useState<PitchTemplate[]>([])
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewingTemplate, setViewingTemplate] = useState<PitchTemplate | null>(null)
  const [viewingPitchData, setViewingPitchData] = useState<PitchDataPoint[]>([])
  const [viewingNoteRange, setViewingNoteRange] = useState({ minNote: 'C3', maxNote: 'C6' })
  const [pitchLoading, setPitchLoading] = useState(false)

  const loadList = async () => {
    const list = await loadTemplates()
    setTemplates(list)
  }

  useEffect(() => { loadList() }, [])

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadList)
    return unsubscribe
  }, [navigation])

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
        sampleRate: 10,
        duration: result.duration,
        data: result.points.map(p => ({
          time: p.time,
          freq: p.freq,
          note: p.freq > 0 ? midiToNoteName(freqToMidi(p.freq)) : null,
        })),
      }
      const pitchDataKey = await saveTemplatePitchData(templateId, pitchData)
      await updateTemplate({ ...template, pitchDataKey })
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
      { options: ['取消', '从文件导入'], cancelButtonIndex: 0 },
      (index) => { if (index === 1) importFromFile() }
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
    setViewingTemplate(template)
    setViewingPitchData([])
    setViewingNoteRange({ minNote: 'C3', maxNote: 'C6' })
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
                <Text style={[styles.itemName, { color: colors.text }]}>♪ {template.name}</Text>
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

      {/* FAB：非选择模式 + 非导入中时显示 */}
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

      {/* 模板音高曲线查看 Modal */}
      <Modal
        visible={viewingTemplate !== null}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setViewingTemplate(null)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setViewingTemplate(null)}>
              <Ionicons name="chevron-down" size={28} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
              {viewingTemplate?.name}
            </Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.modalChart}>
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
            ) : (
              <PlaybackPitchChart
                data={viewingPitchData}
                minNote={viewingNoteRange.minNote}
                maxNote={viewingNoteRange.maxNote}
                totalDuration={viewingTemplate?.duration ?? 0}
                currentTime={0}
                isPlaying={false}
              />
            )}
          </View>
        </SafeAreaView>
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
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  modalChart: { flex: 1 },
  chartPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
})
