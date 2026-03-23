import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Share } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { Recording } from '../types'
import { loadRecordings, saveRecordings, deleteRecordingFiles } from '../services/storage'
import { audioService } from '../services/audio'

export function RecordingsScreen({ navigation }: any) {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 格式化时长
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  // 切换选择状态
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
    if (newSelected.size === 0) {
      setIsSelectionMode(false)
    }
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === recordings.length) {
      setSelectedIds(new Set())
      setIsSelectionMode(false)
    } else {
      setSelectedIds(new Set(recordings.map(r => r.id)))
    }
  }

  // 退出选择模式
  const exitSelectionMode = () => {
    setSelectedIds(new Set())
    setIsSelectionMode(false)
  }

  // 加载录音列表
  const loadRecordingsList = async () => {
    const list = await loadRecordings()
    setRecordings(list)
  }

  useEffect(() => {
    loadRecordingsList()
  }, [])

  // 每次切换到此 tab 时重新加载（左滑进入、保存录音后等场景）
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadRecordingsList)
    return unsubscribe
  }, [navigation])

  // 播放录音
  const playRecording = async (recording: Recording) => {
    if (isSelectionMode) {
      toggleSelection(recording.id)
      return
    }

    try {
      if (playingId) {
        audioService.stopPlayback()
        setPlayingId(null)
        return
      }

      setPlayingId(recording.id)
      setCurrentTime(0)

      await audioService.playAudio(
        recording.audioFilePath,
        (time) => setCurrentTime(time)
      )
    } catch (error) {
      console.error('Failed to play recording:', error)
      Alert.alert('播放失败', '无法播放此录音')
    } finally {
      setPlayingId(null)
      setCurrentTime(0)
    }
  }

  // 分享录音
  const shareRecording = async (recording: Recording) => {
    if (isSelectionMode) {
      toggleSelection(recording.id)
      return
    }

    try {
      await Share.share({
        title: '我的音准练习录音',
        message: `分享录音：${recording.name}（时长：${formatDuration(recording.duration)}）`,
      })
    } catch (error) {
      console.error('Failed to share recording:', error)
      Alert.alert('分享失败', '无法分享此录音')
    }
  }

  // 删除单个录音
  const deleteRecording = async (recording: Recording) => {
    if (isSelectionMode) {
      toggleSelection(recording.id)
      return
    }

    Alert.alert(
      '确认删除',
      `确定要删除录音"${recording.name}"吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            if (playingId === recording.id) {
              audioService.stopPlayback()
              setPlayingId(null)
            }
            await deleteRecordingFiles(recording)
            const updatedList = recordings.filter(r => r.id !== recording.id)
            await saveRecordings(updatedList)
            setRecordings(updatedList)
          }
        }
      ]
    )
  }

  // 批量删除
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return

    Alert.alert(
      '确认删除',
      `确定要删除选中的 ${selectedIds.size} 个录音吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            // 停止正在播放的录音（如果在删除列表中）
            if (playingId && selectedIds.has(playingId)) {
              audioService.stopPlayback()
              setPlayingId(null)
            }

            // 删除选中的录音文件
            const selectedIdArray = Array.from(selectedIds)
            for (const id of selectedIdArray) {
              const recording = recordings.find(r => r.id === id)
              if (recording) {
                await deleteRecordingFiles(recording)
              }
            }

            // 更新列表
            const updatedList = recordings.filter(r => !selectedIds.has(r.id))
            await saveRecordings(updatedList)
            setRecordings(updatedList)

            // 退出选择模式
            setSelectedIds(new Set())
            setIsSelectionMode(false)
          }
        }
      ]
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {isSelectionMode ? (
          <>
            <TouchableOpacity onPress={exitSelectionMode}>
              <Text style={styles.backButton}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.title}>已选 {selectedIds.size} 个</Text>
            <TouchableOpacity onPress={toggleSelectAll}>
              <Text style={styles.backButton}>
                {selectedIds.size === recordings.length ? '全不选' : '全选'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={{ width: 60 }} />
            <View style={styles.titleWithIcon}>
              <Ionicons name="folder-outline" size={22} color="#4ECDC4" style={styles.titleIcon} />
              <Text style={styles.title}>我的录音</Text>
            </View>
            {recordings.length > 0 && (
              <TouchableOpacity onPress={() => setIsSelectionMode(true)}>
                <Text style={styles.backButton}>选择</Text>
              </TouchableOpacity>
            )}
            {recordings.length === 0 && <View style={{ width: 60 }} />}
          </>
        )}
      </View>

      {recordings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>暂无录音</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={true}>
          {recordings.map((recording) => (
            <View key={recording.id} style={[
              styles.item,
              isSelectionMode && selectedIds.has(recording.id) && styles.itemSelected
            ]}>
              <TouchableOpacity
                style={styles.itemContent}
                onPress={() => isSelectionMode && toggleSelection(recording.id)}
                activeOpacity={isSelectionMode ? 0.7 : 1}
              >
                {isSelectionMode && (
                  <View style={[
                    styles.checkbox,
                    selectedIds.has(recording.id) && styles.checkboxSelected
                  ]}>
                    {selectedIds.has(recording.id) && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                )}

                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>♪ {recording.name}</Text>
                  <Text style={styles.itemMeta}>
                    时长: {formatDuration(recording.duration)}
                    {recording.fileSize > 0 && ` · ${formatFileSize(recording.fileSize)}`}
                  </Text>
                </View>

                {!isSelectionMode && (
                  <View style={styles.itemActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, playingId === recording.id && styles.playingButton]}
                      onPress={() => playRecording(recording)}
                    >
                      <Text style={styles.actionButtonText}>
                        {playingId === recording.id ? '⏸' : '▶'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => shareRecording(recording)}
                    >
                      <Text style={styles.actionButtonText}>↗</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionButton, styles.deleteButton]}
                      onPress={() => deleteRecording(recording)}
                    >
                      <Text style={styles.actionButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>

              {playingId === recording.id && (
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, (currentTime / Math.max(1, recording.duration)) * 100)}%` }]} />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {isSelectionMode && selectedIds.size > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.bottomBarButton, styles.deleteAllButton]}
            onPress={deleteSelected}
          >
            <Text style={styles.bottomBarButtonText}>删除选中 ({selectedIds.size})</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  backButton: {
    fontSize: 16,
    color: '#007AFF',
    width: 60
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  titleIcon: {
    marginRight: 6
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 16,
    color: '#999'
  },
  list: {
    flex: 1
  },
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  itemSelected: {
    backgroundColor: '#E3F2FD'
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  checkboxSelected: {
    backgroundColor: '#007AFF'
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  itemInfo: {
    flex: 1,
    marginBottom: 8
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4
  },
  itemMeta: {
    fontSize: 14,
    color: '#666'
  },
  itemActions: {
    flexDirection: 'row',
    gap: 12
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8
  },
  playingButton: {
    backgroundColor: '#007AFF'
  },
  deleteButton: {
    backgroundColor: '#FFE5E5'
  },
  actionButtonText: {
    fontSize: 16
  },
  progressBar: {
    marginTop: 8,
    height: 4,
    backgroundColor: '#eee',
    borderRadius: 2,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF'
  },
  bottomBar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff'
  },
  bottomBarButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center'
  },
  deleteAllButton: {
    backgroundColor: '#FF3B30'
  },
  bottomBarButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500'
  }
})
