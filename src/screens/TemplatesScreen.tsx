import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { PitchTemplate } from '../types'
import { loadTemplates } from '../services/templateStorage'
import { useTheme } from '../context/ThemeContext'

export function TemplatesScreen({ navigation }: any) {
  const { colors } = useTheme()
  const [templates, setTemplates] = useState<PitchTemplate[]>([])

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={{ width: 60 }} />
        <View style={styles.titleWithIcon}>
          <Ionicons name="layers-outline" size={22} color="#FF9500" style={styles.titleIcon} />
          <Text style={[styles.title, { color: colors.text }]}>模板</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => {}}>
          <Ionicons name="add" size={28} color="#007AFF" />
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
                <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => {}}>
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
