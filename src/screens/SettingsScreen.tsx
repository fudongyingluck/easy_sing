import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PRESET_MODES } from '../config/constants'
import { loadUserSettings, saveUserSettings } from '../services/storage'
import { UserSettings } from '../types'

export function SettingsScreen({ navigation }: any) {
  const [currentModeId, setCurrentModeId] = useState<string>('female')
  const [customModes, setCustomModes] = useState<any[]>([])

  // 加载用户设置
  useEffect(() => {
    const loadData = async () => {
      const settings = await loadUserSettings()
      setCurrentModeId(settings.currentModeId)
      setCustomModes(settings.customModes)
    }
    loadData()
  }, [])

  // 选择模式
  const handleSelectMode = async (modeId: string) => {
    setCurrentModeId(modeId)
    await saveUserSettings({
      currentModeId: modeId,
      customModes,
      lastUpdated: new Date().toISOString()
    })
  }

  const allModes = [...PRESET_MODES, ...customModes]
  const currentMode = allModes.find(m => m.id === currentModeId) || PRESET_MODES[0]

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>◀ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>⚙️ 设置</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* 模式选择 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>音域模式</Text>
          <Text style={styles.sectionSubtitle}>
            当前: {currentMode.name} ({currentMode.startNote}~{currentMode.endNote})
          </Text>

          <View style={styles.modeList}>
            {allModes.map((mode) => (
              <TouchableOpacity
                key={mode.id}
                style={[
                  styles.modeItem,
                  mode.id === currentModeId && styles.modeItemSelected
                ]}
                onPress={() => handleSelectMode(mode.id)}
              >
                <View style={styles.modeItemLeft}>
                  <Text style={styles.modeItemName}>{mode.name}</Text>
                  <Text style={styles.modeItemRange}>
                    {mode.startNote} ~ {mode.endNote}
                  </Text>
                </View>
                {mode.id === currentModeId && (
                  <Text style={styles.modeItemCheck}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 其他设置项可以后续添加 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <Text style={styles.aboutText}>实时音准练习 v1.0</Text>
        </View>
      </ScrollView>
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
    color: '#64B5F6',
    width: 60
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  content: {
    flex: 1
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16
  },
  modeList: {
    marginTop: 8
  },
  modeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8
  },
  modeItemSelected: {
    backgroundColor: '#E1F5FE'
  },
  modeItemLeft: {
    flex: 1
  },
  modeItemName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2
  },
  modeItemRange: {
    fontSize: 14,
    color: '#666'
  },
  modeItemCheck: {
    fontSize: 20,
    color: '#64B5F6',
    fontWeight: 'bold'
  },
  aboutText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8
  }
})
