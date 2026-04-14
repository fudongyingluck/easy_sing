import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActionSheetIOS, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { PitchTemplate } from '../types'
import { loadTemplates, addTemplate, deleteTemplate } from '../services/templateStorage'
import { pickAudioFile, copyAudioFileToImports, getAudioDuration } from '../services/documentPicker'
import { useTheme } from '../context/ThemeContext'

const MAX_DURATION = 600 // 10 分钟

export function TemplatesScreen({ navigation }: any) {
  const { colors } = useTheme()
  const [templates, setTemplates] = useState<PitchTemplate[]>([])
  const [importing, setImporting] = useState(false)

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

  const importFromFile = async () => {
    try {
      const srcPath = await pickAudioFile()
      if (!srcPath) return

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
      const destPath = await copyAudioFileToImports(srcPath)
      const filename = destPath.split('/').pop() ?? destPath
      // 去掉时间戳后缀（_1234567890.mp3 → .mp3）用于显示
      const displayName = filename.replace(/_\d+(\.\w+)$/, '$1')
      const nameWithoutExt = displayName.replace(/\.\w+$/, '')

      const template: PitchTemplate = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: nameWithoutExt,
        sourceFileName: displayName,
        audioFilePath: filename,
        pitchDataKey: '',
        duration: Math.min(duration, MAX_DURATION),
        createTime: new Date().toISOString(),
      }

      await addTemplate(template)
      await loadList()
    } catch (error: any) {
      Alert.alert('导入失败', error?.message ?? String(error))
    } finally {
      setImporting(false)
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
          await deleteTemplate(template.id)
          await loadList()
        }
      }
    ])
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={{ width: 60 }} />
        <View style={styles.titleWithIcon}>
          <Ionicons name="layers-outline" size={22} color="#FF9500" style={styles.titleIcon} />
          <Text style={[styles.title, { color: colors.text }]}>模板</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={onAddPress} disabled={importing}>
          {importing
            ? <ActivityIndicator size="small" color="#007AFF" />
            : <Ionicons name="add" size={28} color="#007AFF" />
          }
        </TouchableOpacity>
      </View>

      {templates.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="layers-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>暂无模板</Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>点击右上角 + 导入音频</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator>
          {templates.map((template) => (
            <TouchableOpacity
              key={template.id}
              style={[styles.item, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
              onPress={() => {}}
              activeOpacity={0.7}
            >
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: colors.text }]}>♪ {template.name}</Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  时长: {formatDuration(template.duration)} · {template.sourceFileName}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => onDeletePress(template)}>
                  <Text style={styles.actionButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: 'bold' },
  titleWithIcon: { flexDirection: 'row', alignItems: 'center' },
  titleIcon: { marginRight: 6 },
  addButton: { width: 60, alignItems: 'flex-end' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, marginBottom: 6 },
  emptyHint: { fontSize: 14 },
  list: { flex: 1 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderBottomWidth: 1,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '500', marginBottom: 4 },
  itemMeta: { fontSize: 14 },
  itemActions: { flexDirection: 'row', gap: 12 },
  actionButton: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f0f0f0', borderRadius: 8 },
  deleteButton: { backgroundColor: '#FFE5E5' },
  actionButtonText: { fontSize: 16 },
})
