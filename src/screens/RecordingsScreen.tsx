import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Share, Modal } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { Recording, PitchDataPoint } from '../types'
import { loadRecordings, saveRecordings, deleteRecordingFiles, loadPitchData } from '../services/storage'
import { audioService } from '../services/audio'
import { PitchChart } from '../components/PitchChart'
import { freqToMidi, midiToNoteName } from '../utils/noteUtils'
import { useTheme } from '../context/ThemeContext'

export function RecordingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 全屏播放器状态
  const [playerVisible, setPlayerVisible] = useState(false)
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [pitchData, setPitchData] = useState<PitchDataPoint[]>([])
  const [pitchNoteRange, setPitchNoteRange] = useState<{ minNote: string; maxNote: string }>({ minNote: 'C3', maxNote: 'C6' })
  const [chartAreaHeight, setChartAreaHeight] = useState(0)

  // 格式化时长
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    setSelectedIds(newSelected)
    if (newSelected.size === 0) setIsSelectionMode(false)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === recordings.length) {
      setSelectedIds(new Set())
      setIsSelectionMode(false)
    } else {
      setSelectedIds(new Set(recordings.map(r => r.id)))
    }
  }

  const exitSelectionMode = () => {
    setSelectedIds(new Set())
    setIsSelectionMode(false)
  }

  const loadRecordingsList = async () => {
    const list = await loadRecordings()
    setRecordings(list)
  }

  useEffect(() => { loadRecordingsList() }, [])

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadRecordingsList)
    return unsubscribe
  }, [navigation])

  // 加载音高数据
  const loadPitchForRecording = async (recording: Recording) => {
    const loaded = await loadPitchData(recording.pitchDataKey)
    if (!loaded || loaded.data.length === 0) { setPitchData([]); return }
    const midis = loaded.data.filter(p => p.freq > 0).map(p => freqToMidi(p.freq))
    if (midis.length === 0) { setPitchData([]); return }
    const minMidi = Math.max(21, midis.reduce((a, b) => Math.min(a, b)) - 3)
    const maxMidi = Math.min(108, midis.reduce((a, b) => Math.max(a, b)) + 3)
    setPitchNoteRange({ minNote: midiToNoteName(minMidi), maxNote: midiToNoteName(maxMidi) })
    setPitchData(loaded.data)
  }

  // 开始播放（内部，可复用）
  const startAudio = async (recording: Recording) => {
    setIsPlaying(true)
    try {
      await audioService.playAudio(recording.audioFilePath, (time) => setCurrentTime(time))
    } catch (error: any) {
      console.error('Failed to play recording:', error)
      const isNotFound = error?.code?.includes('2003334207') || error?.code?.includes('ENOENT')
      Alert.alert('播放失败', isNotFound ? '录音文件已丢失，无法播放' : String(error?.message ?? error))
    } finally {
      setIsPlaying(false)
      setCurrentTime(0)
    }
  }

  // 打开全屏播放器
  const openPlayer = (recording: Recording) => {
    audioService.stopPlayback()
    setActiveRecording(recording)
    setCurrentTime(0)
    setIsPlaying(false)
    setPitchData([])
    setPlayerVisible(true)
    loadPitchForRecording(recording)
  }

  // 关闭播放器
  const closePlayer = () => {
    audioService.stopPlayback()
    setPlayerVisible(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setActiveRecording(null)
    setPitchData([])
  }

  // 播放/暂停切换
  const togglePlayPause = async () => {
    if (isPlaying) {
      audioService.pausePlayback()
      setIsPlaying(false)
    } else if (audioService.hasPlayback()) {
      // 有 sound 对象 → 继续
      setIsPlaying(true)
      audioService.resumePlayback((time) => setCurrentTime(time))
    } else if (activeRecording) {
      // 播放已自然结束 → 从头重放
      setCurrentTime(0)
      await startAudio(activeRecording)
    }
  }

  const onRecordingPress = (recording: Recording) => {
    if (isSelectionMode) { toggleSelection(recording.id); return }
    openPlayer(recording)
  }

  const shareRecording = async (recording: Recording) => {
    if (isSelectionMode) { toggleSelection(recording.id); return }
    try {
      await Share.share({
        title: '我的音准练习录音',
        message: `分享录音：${recording.name}（时长：${formatDuration(recording.duration)}）`,
      })
    } catch (error) {
      Alert.alert('分享失败', '无法分享此录音')
    }
  }

  const deleteRecording = async (recording: Recording) => {
    if (isSelectionMode) { toggleSelection(recording.id); return }
    Alert.alert('确认删除', `确定要删除录音"${recording.name}"吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          if (activeRecording?.id === recording.id) closePlayer()
          await deleteRecordingFiles(recording)
          const updatedList = recordings.filter(r => r.id !== recording.id)
          await saveRecordings(updatedList)
          setRecordings(updatedList)
        }
      }
    ])
  }

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return
    Alert.alert('确认删除', `确定要删除选中的 ${selectedIds.size} 个录音吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: async () => {
          if (activeRecording && selectedIds.has(activeRecording.id)) closePlayer()
          for (const id of Array.from(selectedIds)) {
            const rec = recordings.find(r => r.id === id)
            if (rec) await deleteRecordingFiles(rec)
          }
          const updatedList = recordings.filter(r => !selectedIds.has(r.id))
          await saveRecordings(updatedList)
          setRecordings(updatedList)
          setSelectedIds(new Set())
          setIsSelectionMode(false)
        }
      }
    ])
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {isSelectionMode ? (
          <>
            <TouchableOpacity onPress={exitSelectionMode}>
              <Text style={styles.headerAction}>取消</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>已选 {selectedIds.size} 个</Text>
            <TouchableOpacity onPress={toggleSelectAll}>
              <Text style={styles.headerAction}>
                {selectedIds.size === recordings.length ? '全不选' : '全选'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={{ width: 60 }} />
            <View style={styles.titleWithIcon}>
              <Ionicons name="folder-outline" size={22} color="#4ECDC4" style={styles.titleIcon} />
              <Text style={[styles.title, { color: colors.text }]}>我的录音</Text>
            </View>
            {recordings.length > 0 ? (
              <TouchableOpacity onPress={() => setIsSelectionMode(true)}>
                <Text style={styles.headerAction}>选择</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 60 }} />
            )}
          </>
        )}
      </View>

      {recordings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>暂无录音</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator>
          {recordings.map((recording) => (
            <TouchableOpacity
              key={recording.id}
              style={[styles.item, { backgroundColor: colors.surface, borderBottomColor: colors.border }, isSelectionMode && selectedIds.has(recording.id) && styles.itemSelected]}
              onPress={() => onRecordingPress(recording)}
              activeOpacity={0.7}
            >
              {isSelectionMode && (
                <View style={[styles.checkbox, selectedIds.has(recording.id) && styles.checkboxSelected]}>
                  {selectedIds.has(recording.id) && <Text style={styles.checkmark}>✓</Text>}
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: colors.text }]}>♪ {recording.name}</Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  时长: {formatDuration(recording.duration)}
                  {recording.fileSize > 0 && ` · ${formatFileSize(recording.fileSize)}`}
                </Text>
              </View>
              {!isSelectionMode && (
                <View style={styles.itemActions}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => shareRecording(recording)}>
                    <Text style={styles.actionButtonText}>↗</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => deleteRecording(recording)}>
                    <Text style={styles.actionButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {isSelectionMode && selectedIds.size > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={[styles.bottomBarButton, styles.deleteAllButton]} onPress={deleteSelected}>
            <Text style={styles.bottomBarButtonText}>删除选中 ({selectedIds.size})</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 全屏播放器 */}
      <Modal visible={playerVisible} animationType="slide" statusBarTranslucent onRequestClose={closePlayer}>
        <View style={styles.playerContainer}>
          {/* 顶栏 */}
          <View style={[styles.playerHeader, { paddingTop: insets.top + 8 }]}>
            <View style={{ width: 64 }} />
            <Text style={styles.playerTitle} numberOfLines={1}>{activeRecording?.name ?? ''}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={closePlayer}>
              <Text style={styles.closeLabel}>收起</Text>
              <Ionicons name="chevron-down" size={20} color="#aaa" />
            </TouchableOpacity>
          </View>

          {/* 音高曲线区域 */}
          <View
            style={{ flex: 1 }}
            onLayout={(e) => setChartAreaHeight(e.nativeEvent.layout.height)}
          >
            {chartAreaHeight > 0 && pitchData.length > 0 ? (
              <PitchChart
                data={pitchData}
                minNote={pitchNoteRange.minNote}
                maxNote={pitchNoteRange.maxNote}
                height={chartAreaHeight}
                currentTime={currentTime}
                paused={!isPlaying}
                seekable
                onSeekChange={(t) => audioService.seekTo(t)}
              />
            ) : (
              <View style={styles.noChartPlaceholder}>
                <Text style={styles.noChartText}>
                  {pitchData.length === 0 ? '无音高数据' : '加载中...'}
                </Text>
              </View>
            )}
          </View>

          {/* 底部播放控件 */}
          <View style={[styles.playerControls, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.progressRow}>
              <Text style={styles.timeText}>{formatDuration(Math.floor(currentTime))}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, {
                  width: `${Math.min(100, (currentTime / Math.max(1, activeRecording?.duration ?? 1)) * 100)}%`
                }]} />
              </View>
              <Text style={styles.timeText}>{formatDuration(activeRecording?.duration ?? 0)}</Text>
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
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee'
  },
  headerAction: { fontSize: 16, color: '#007AFF', width: 60 },
  title: { fontSize: 18, fontWeight: 'bold' },
  titleWithIcon: { flexDirection: 'row', alignItems: 'center' },
  titleIcon: { marginRight: 6 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999' },
  list: { flex: 1 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee'
  },
  itemSelected: { backgroundColor: '#E3F2FD' },
  checkbox: {
    width: 24, height: 24, borderWidth: 2, borderColor: '#007AFF',
    borderRadius: 4, marginRight: 12, justifyContent: 'center', alignItems: 'center'
  },
  checkboxSelected: { backgroundColor: '#007AFF' },
  checkmark: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '500', marginBottom: 4 },
  itemMeta: { fontSize: 14, color: '#666' },
  itemActions: { flexDirection: 'row', gap: 12 },
  actionButton: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f0f0f0', borderRadius: 8 },
  deleteButton: { backgroundColor: '#FFE5E5' },
  actionButtonText: { fontSize: 16 },
  bottomBar: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  bottomBarButton: { padding: 16, borderRadius: 8, alignItems: 'center' },
  deleteAllButton: { backgroundColor: '#FF3B30' },
  bottomBarButtonText: { color: '#fff', fontSize: 16, fontWeight: '500' },

  // 全屏播放器
  playerContainer: { flex: 1, backgroundColor: '#111' },
  playerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingBottom: 4
  },
  closeButton: {
    width: 64, height: 44, justifyContent: 'center', alignItems: 'center',
    flexDirection: 'row', gap: 4
  },
  closeLabel: { color: '#aaa', fontSize: 14 },
  playerTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#fff', textAlign: 'center' },
  noChartPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noChartText: { color: '#666', fontSize: 16 },
  playerControls: {
    paddingHorizontal: 24, paddingTop: 12,
    backgroundColor: '#111'
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  timeText: { fontSize: 12, color: '#aaa', width: 36, textAlign: 'center' },
  progressTrack: { flex: 1, height: 4, backgroundColor: '#444', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#007AFF' },
  playPauseButton: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#007AFF',
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center'
  },
})
