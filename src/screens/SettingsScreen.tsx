import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PRESET_MODES, CONFIG } from '../config/constants'
import { loadUserSettings, saveUserSettings } from '../services/storage'
import { noteNameToMidi, midiToNoteName, noteNameToFreq } from '../utils/noteUtils'
import { NotePicker } from '../components/NotePicker'

export function SettingsScreen() {
  const [currentModeId, setCurrentModeId] = useState<string>('female')
  const [customModes, setCustomModes] = useState<any[]>([])
  const [showAddMode, setShowAddMode] = useState(false)
  const [newModeName, setNewModeName] = useState('')
  const [newModeStartNote, setNewModeStartNote] = useState('C3')
  const [newModeEndNote, setNewModeEndNote] = useState('C6')
  const [showStartNotePicker, setShowStartNotePicker] = useState(false)
  const [showEndNotePicker, setShowEndNotePicker] = useState(false)

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

  // 添加自定义模式
  const handleAddMode = async () => {
    if (!newModeName.trim()) {
      Alert.alert('提示', '请输入模式名称')
      return
    }

    // 检查重名（包括预设模式）
    const allNames = [...PRESET_MODES, ...customModes].map(m => m.name.trim())
    if (allNames.includes(newModeName.trim())) {
      Alert.alert('提示', '该模式名称已存在，请使用其他名称')
      return
    }

    const startMidi = noteNameToMidi(newModeStartNote)
    const endMidi = noteNameToMidi(newModeEndNote)

    if (startMidi >= endMidi) {
      Alert.alert('提示', '最低音必须低于最高音')
      return
    }

    const newMode = {
      id: `custom_${Date.now()}`,
      name: newModeName.trim(),
      startNote: newModeStartNote,
      endNote: newModeEndNote,
      minFreq: noteNameToFreq(newModeStartNote),
      maxFreq: noteNameToFreq(newModeEndNote)
    }

    const updatedCustomModes = [...customModes, newMode]
    setCustomModes(updatedCustomModes)
    await saveUserSettings({
      currentModeId,
      customModes: updatedCustomModes,
      lastUpdated: new Date().toISOString()
    })

    // 重置表单
    setNewModeName('')
    setNewModeStartNote('C3')
    setNewModeEndNote('C6')
    setShowAddMode(false)
  }

  // 删除自定义模式
  const handleDeleteMode = (modeId: string) => {
    Alert.alert(
      '确认删除',
      '确定要删除这个自定义模式吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            const updatedCustomModes = customModes.filter(m => m.id !== modeId)
            const newCurrentModeId = currentModeId === modeId ? 'female' : currentModeId
            setCustomModes(updatedCustomModes)
            setCurrentModeId(newCurrentModeId)
            await saveUserSettings({
              currentModeId: newCurrentModeId,
              customModes: updatedCustomModes,
              lastUpdated: new Date().toISOString()
            })
          }
        }
      ]
    )
  }

  const allModes = [...PRESET_MODES, ...customModes]
  const currentMode = allModes.find(m => m.id === currentModeId) || PRESET_MODES[0]

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 60 }} />
        <Text style={styles.title}>设置</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* 音域模式 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>音域模式</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => {
                if (customModes.length >= CONFIG.MAX_CUSTOM_MODES) {
                  Alert.alert('提示', `最多只能添加 ${CONFIG.MAX_CUSTOM_MODES} 个自定义模式`)
                  return
                }
                setShowAddMode(true)
              }}
            >
              <Text style={styles.addButtonText}>+ 添加</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modeList}>
            {allModes.map((mode) => {
              const isCustom = mode.id.startsWith('custom_')
              return (
                <View key={mode.id} style={styles.modeItemWrapper}>
                  <TouchableOpacity
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
                  {isCustom && (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteMode(mode.id)}
                    >
                      <Text style={styles.deleteButtonText}>删除</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
          </View>
        </View>

        {/* 其他设置项可以后续添加 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <Text style={styles.aboutText}>实时音准练习 v1.0</Text>
        </View>
      </ScrollView>

      {/* 添加自定义模式弹窗 */}
      {showAddMode && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowAddMode(false)}>
                <Text style={styles.modalCancel}>取消</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>添加自定义模式</Text>
              <TouchableOpacity onPress={handleAddMode}>
                <Text style={styles.modalSave}>保存</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <Text style={styles.label}>模式名称</Text>
              <TextInput
                style={styles.input}
                value={newModeName}
                onChangeText={setNewModeName}
                placeholder="例如：我的音域"
                autoFocus
              />

              <Text style={styles.label}>最低音</Text>
              <TouchableOpacity
                style={styles.notePickerButton}
                onPress={() => setShowStartNotePicker(true)}
              >
                <Text style={styles.notePickerButtonText}>{newModeStartNote}</Text>
              </TouchableOpacity>

              <Text style={styles.label}>最高音</Text>
              <TouchableOpacity
                style={styles.notePickerButton}
                onPress={() => setShowEndNotePicker(true)}
              >
                <Text style={styles.notePickerButtonText}>{newModeEndNote}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 最低音选择器 */}
      <NotePicker
        visible={showStartNotePicker}
        selectedNote={newModeStartNote}
        maxNote={newModeEndNote}
        onSelect={(note) => setNewModeStartNote(note)}
        onClose={() => setShowStartNotePicker(false)}
      />

      {/* 最高音选择器 */}
      <NotePicker
        visible={showEndNotePicker}
        selectedNote={newModeEndNote}
        minNote={newModeStartNote}
        onSelect={(note) => setNewModeEndNote(note)}
        onClose={() => setShowEndNotePicker(false)}
      />
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500'
  },
  modeList: {
    marginTop: 8
  },
  modeItemWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  modeItem: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8
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
  deleteButton: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  deleteButtonText: {
    color: '#FF3B30',
    fontSize: 14
  },
  aboutText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  modalCancel: {
    fontSize: 16,
    color: '#666',
    width: 60
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  modalSave: {
    fontSize: 16,
    color: '#007AFF',
    width: 60,
    textAlign: 'right'
  },
  form: {
    padding: 16
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 12
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16
  },
  notePickerButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center'
  },
  notePickerButtonText: {
    fontSize: 18,
    fontWeight: '500'
  }
})
