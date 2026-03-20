import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Share } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Recording } from '../types'
import { loadRecordings, saveRecordings, deleteRecordingFiles } from '../services/storage'
import { audioService } from '../services/audio'

export function RecordingsScreen({ navigation }: any) {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    loadRecordingsList()
  }, [])

  const loadRecordingsList = async () => {
    const list = await loadRecordings()
    setRecordings(list)
  }

  // 播放录音
  const playRecording = async (recording: Recording) => {
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

  // 删除录音
  const deleteRecording = async (recording: Recording) => {
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>◀ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📂 我的录音</Text>
        <View style={{ width: 60 }} />
      </View>

      {recordings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>暂无录音</Text>
        </View>
      ) : (
        <ScrollView style={styles.list}>
          {recordings.map((recording) => (
            <View key={recording.id} style={styles.item}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>♪ {recording.name}</Text>
                <Text style={styles.itemMeta}>
                  时长: {formatDuration(recording.duration)}
                  {recording.fileSize > 0 && ` · ${formatFileSize(recording.fileSize)}`}
                </Text>
              </View>

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

              {playingId === recording.id && (
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, (currentTime / Math.max(1, recording.duration)) * 100)}%` }]} />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
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
  }
})
