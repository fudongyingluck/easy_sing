import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Switch, Alert, Modal, TextInput
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from 'react-native-vector-icons/Ionicons'
import { PRESET_MODES, CONFIG } from '../config/constants'
import { loadUserSettings, saveUserSettings } from '../services/storage'
import { noteNameToMidi, noteNameToFreq } from '../utils/noteUtils'
import { NotePicker } from '../components/NotePicker'
import { UserSettings } from '../types'

// ─── SettingRow ───────────────────────────────────────────────────────────────

interface SettingRowProps {
  icon: string
  iconColor: string
  title: string
  value?: string
  onPress?: () => void
  rightNode?: React.ReactNode
  isLast?: boolean
}

function SettingRow({ icon, iconColor, title, value, onPress, rightNode, isLast }: SettingRowProps) {
  const content = (
    <View style={[rs.row, !isLast && rs.borderBottom]}>
      <View style={[rs.iconBox, { backgroundColor: iconColor }]}>
        <Ionicons name={icon} size={17} color="#fff" />
      </View>
      <Text style={rs.title}>{title}</Text>
      <View style={rs.right}>
        {value != null && <Text style={rs.value}>{value}</Text>}
        {rightNode}
        {onPress && !rightNode && (
          <Ionicons name="chevron-forward" size={16} color="#C7C7CC" style={{ marginLeft: 2 }} />
        )}
      </View>
    </View>
  )
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.6}>{content}</TouchableOpacity>
  }
  return content
}

const rs = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    minHeight: 44,
  },
  borderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  value: {
    fontSize: 15,
    color: '#8E8E93',
    marginRight: 4,
  },
})

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={ss.wrapper}>
      {title && <Text style={ss.header}>{title}</Text>}
      <View style={ss.card}>{children}</View>
    </View>
  )
}

const ss = StyleSheet.create({
  wrapper: { marginBottom: 28 },
  header: {
    fontSize: 13,
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
  },
})

// ─── OptionPicker ─────────────────────────────────────────────────────────────

interface PickerOption {
  label: string
  value: any
}

interface OptionPickerProps {
  visible: boolean
  title: string
  options: PickerOption[]
  selected: any
  onSelect: (v: any) => void
  onClose: () => void
}

function OptionPicker({ visible, title, options, selected, onSelect, onClose }: OptionPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ops.overlay} onPress={onClose} activeOpacity={1} />
      <View style={ops.sheet}>
        <View style={ops.handle} />
        <Text style={ops.sheetTitle}>{title}</Text>
        <View style={ops.optionCard}>
          {options.map((opt, i) => (
            <TouchableOpacity
              key={String(opt.value)}
              style={[ops.option, i < options.length - 1 && rs.borderBottom]}
              onPress={() => { onSelect(opt.value); onClose() }}
            >
              <Text style={[ops.optLabel, opt.value === selected && ops.optSelected]}>
                {opt.label}
              </Text>
              {opt.value === selected && (
                <Ionicons name="checkmark" size={20} color="#FF6B6B" />
              )}
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={ops.cancelCard} onPress={onClose}>
          <Text style={ops.cancelText}>取消</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

const ops = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 34,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sheetTitle: {
    textAlign: 'center',
    fontSize: 13,
    color: '#6D6D72',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  optionCard: {
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  optLabel: {
    fontSize: 16,
    color: '#000',
  },
  optSelected: {
    color: '#FF6B6B',
    fontWeight: '500',
  },
  cancelCard: {
    marginTop: 8,
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
})

// ─── ModeSubPage ──────────────────────────────────────────────────────────────

interface ModeSubPageProps {
  settings: UserSettings
  onBack: () => void
  onUpdate: (s: UserSettings) => void
}

function ModeSubPage({ settings, onBack, onUpdate }: ModeSubPageProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('C3')
  const [newEnd, setNewEnd] = useState('C6')
  const [showStartPicker, setShowStartPicker] = useState(false)
  const [showEndPicker, setShowEndPicker] = useState(false)

  const persist = async (updated: UserSettings) => {
    onUpdate(updated)
    await saveUserSettings(updated)
  }

  const handleSelect = (modeId: string) => {
    persist({ ...settings, currentModeId: modeId })
  }

  const handleAdd = async () => {
    if (!newName.trim()) {
      Alert.alert('提示', '请输入模式名称')
      return
    }
    const allNames = [...PRESET_MODES, ...settings.customModes].map(m => m.name.trim())
    if (allNames.includes(newName.trim())) {
      Alert.alert('提示', '该名称已存在')
      return
    }
    if (noteNameToMidi(newStart) >= noteNameToMidi(newEnd)) {
      Alert.alert('提示', '最低音必须低于最高音')
      return
    }
    const newMode = {
      id: `custom_${Date.now()}`,
      name: newName.trim(),
      startNote: newStart,
      endNote: newEnd,
      minFreq: noteNameToFreq(newStart),
      maxFreq: noteNameToFreq(newEnd),
    }
    await persist({ ...settings, customModes: [...settings.customModes, newMode] })
    setNewName('')
    setNewStart('C3')
    setNewEnd('C6')
    setShowAdd(false)
  }

  const handleDelete = (modeId: string) => {
    Alert.alert('确认删除', '确定要删除这个自定义模式吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive',
        onPress: () => {
          const updatedModes = settings.customModes.filter(m => m.id !== modeId)
          const newModeId = settings.currentModeId === modeId ? 'female' : settings.currentModeId
          persist({ ...settings, customModes: updatedModes, currentModeId: newModeId })
        },
      },
    ])
  }

  return (
    <SafeAreaView style={msp.container}>
      <View style={msp.header}>
        <TouchableOpacity onPress={onBack} style={msp.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FF6B6B" />
          <Text style={msp.backText}>设置</Text>
        </TouchableOpacity>
        <Text style={msp.headerTitle}>音域模式</Text>
        <TouchableOpacity
          style={msp.addBtn}
          onPress={() => {
            if (settings.customModes.length >= CONFIG.MAX_CUSTOM_MODES) {
              Alert.alert('提示', `最多只能添加 ${CONFIG.MAX_CUSTOM_MODES} 个自定义模式`)
              return
            }
            setShowAdd(true)
          }}
        >
          <Text style={msp.addBtnText}>添加</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={msp.scroll}>
        <Text style={ss.header}>预设</Text>
        <View style={ss.card}>
          {PRESET_MODES.map((mode, i) => (
            <TouchableOpacity
              key={mode.id}
              style={[msp.modeRow, i < PRESET_MODES.length - 1 && rs.borderBottom]}
              onPress={() => handleSelect(mode.id)}
              activeOpacity={0.6}
            >
              <Ionicons name={mode.icon} size={22} color="#FF6B6B" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={msp.modeName}>{mode.name}</Text>
                <Text style={msp.modeRange}>{mode.startNote} ~ {mode.endNote}</Text>
              </View>
              {mode.id === settings.currentModeId && (
                <Ionicons name="checkmark-circle" size={22} color="#FF6B6B" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {settings.customModes.length > 0 && (
          <>
            <Text style={[ss.header, { marginTop: 24 }]}>自定义</Text>
            <View style={ss.card}>
              {settings.customModes.map((mode, i) => (
                <View
                  key={mode.id}
                  style={[msp.modeRow, i < settings.customModes.length - 1 && rs.borderBottom]}
                >
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => handleSelect(mode.id)}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="person-outline" size={22} color="#FF6B6B" style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={msp.modeName}>{mode.name}</Text>
                      <Text style={msp.modeRange}>{mode.startNote} ~ {mode.endNote}</Text>
                    </View>
                    {mode.id === settings.currentModeId && (
                      <Ionicons name="checkmark-circle" size={22} color="#FF6B6B" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(mode.id)} style={{ paddingLeft: 16 }}>
                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* 添加模式弹窗 */}
      {showAdd && (
        <View style={msp.overlay}>
          <View style={msp.modalCard}>
            <View style={msp.modalHeader}>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Text style={{ color: '#666', fontSize: 16 }}>取消</Text>
              </TouchableOpacity>
              <Text style={msp.modalTitle}>添加自定义模式</Text>
              <TouchableOpacity onPress={handleAdd}>
                <Text style={{ color: '#007AFF', fontSize: 16, fontWeight: '600' }}>保存</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={msp.label}>模式名称</Text>
              <TextInput
                style={msp.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="例如：我的音域"
                autoFocus
              />
              <Text style={msp.label}>最低音</Text>
              <TouchableOpacity style={msp.notePicker} onPress={() => setShowStartPicker(true)}>
                <Text style={msp.notePickerText}>{newStart}</Text>
              </TouchableOpacity>
              <Text style={msp.label}>最高音</Text>
              <TouchableOpacity style={msp.notePicker} onPress={() => setShowEndPicker(true)}>
                <Text style={msp.notePickerText}>{newEnd}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <NotePicker
        visible={showStartPicker}
        selectedNote={newStart}
        maxNote={newEnd}
        onSelect={setNewStart}
        onClose={() => setShowStartPicker(false)}
      />
      <NotePicker
        visible={showEndPicker}
        selectedNote={newEnd}
        minNote={newStart}
        onSelect={setNewEnd}
        onClose={() => setShowEndPicker(false)}
      />
    </SafeAreaView>
  )
}

const msp = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
    backgroundColor: '#F2F2F7',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 64 },
  backText: { color: '#FF6B6B', fontSize: 17 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  addBtn: { minWidth: 64, alignItems: 'flex-end' },
  addBtnText: { color: '#FF6B6B', fontSize: 17 },
  scroll: { paddingTop: 20, paddingBottom: 40 },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    minHeight: 54,
  },
  modeName: { fontSize: 16, fontWeight: '500', color: '#000' },
  modeRange: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '500', marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  notePicker: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  notePickerText: { fontSize: 18, fontWeight: '500' },
})

// ─── SettingsScreen ───────────────────────────────────────────────────────────

export function SettingsScreen() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [page, setPage] = useState<'main' | 'modes'>('main')
  const [activePicker, setActivePicker] = useState<string | null>(null)

  useEffect(() => {
    loadUserSettings().then(setSettings)
  }, [])

  if (!settings) return null

  const save = async (updated: UserSettings) => {
    setSettings(updated)
    await saveUserSettings(updated)
  }

  if (page === 'modes') {
    return (
      <ModeSubPage
        settings={settings}
        onBack={() => setPage('main')}
        onUpdate={setSettings}
      />
    )
  }

  const currentMode = [...PRESET_MODES, ...settings.customModes].find(m => m.id === settings.currentModeId) || PRESET_MODES[1]

  const noteDisplayLabels: Record<string, string> = {
    english: 'C / D / E',
    solfege: 'Do / Re / Mi',
    number: '1 / 2 / 3',
  }

  const noteDisplayOptions = [
    { label: 'C / D / E（英文）', value: 'english' },
    { label: 'Do / Re / Mi（唱名）', value: 'solfege' },
    { label: '1 / 2 / 3（数字）', value: 'number' },
  ]

  const durationLabel =
    settings.recordingDurationLimit === 0 ? '无限制'
    : settings.recordingDurationLimit >= 60 ? `${settings.recordingDurationLimit / 60} 分钟`
    : `${settings.recordingDurationLimit} 秒`

  return (
    <SafeAreaView style={main.container}>
      <View style={main.header}>
        <Ionicons name="settings-outline" size={20} color="#FF6B6B" style={{ marginRight: 8 }} />
        <Text style={main.headerTitle}>设置</Text>
      </View>

      <ScrollView contentContainerStyle={main.scroll}>
        <Section title="音高检测">
          <SettingRow
            icon="radio-outline" iconColor="#FF6B6B"
            title="音域模式" value={currentMode.name}
            onPress={() => setPage('modes')}
          />
          <SettingRow
            icon="pulse-outline" iconColor="#FF9500"
            title="检测频率" value={`${settings.pitchDetectionRate} Hz`}
            onPress={() => setActivePicker('pitchRate')}
          />
          <SettingRow
            icon="volume-low-outline" iconColor="#34C759"
            title="触发音量" value={`${settings.triggerVolume} dB`}
            onPress={() => setActivePicker('triggerVolume')}
            isLast
          />
        </Section>

        <Section title="录音">
          <SettingRow
            icon="timer-outline" iconColor="#5856D6"
            title="录音时长限制" value={durationLabel}
            onPress={() => setActivePicker('duration')}
          />
          <SettingRow
            icon="mic-off-outline" iconColor="#FF2D55"
            title="音量过低停止检测"
            rightNode={
              <Switch
                value={settings.autoStopOnLowVolume}
                onValueChange={v => save({ ...settings, autoStopOnLowVolume: v })}
                trackColor={{ false: '#C7C7CC', true: '#FF6B6B' }}
                thumbColor="#fff"
              />
            }
            isLast
          />
        </Section>

        <Section title="显示">
          <SettingRow
            icon="text-outline" iconColor="#007AFF"
            title="左 Y 轴音符名称" value={noteDisplayLabels[settings.leftYAxisDisplay]}
            onPress={() => setActivePicker('leftDisplay')}
          />
          <SettingRow
            icon="text" iconColor="#5AC8FA"
            title="右 Y 轴音符名称" value={noteDisplayLabels[settings.rightYAxisDisplay]}
            onPress={() => setActivePicker('rightDisplay')}
          />
          <SettingRow
            icon="git-branch-outline" iconColor="#32ADE6"
            title="Y 轴双侧显示"
            rightNode={
              <Switch
                value={settings.showBothYAxes}
                onValueChange={v => save({ ...settings, showBothYAxes: v })}
                trackColor={{ false: '#C7C7CC', true: '#FF6B6B' }}
                thumbColor="#fff"
              />
            }
            isLast
          />
        </Section>

        <Section title="关于">
          <SettingRow
            icon="information-circle-outline" iconColor="#8E8E93"
            title="版本" value="v1.0"
            isLast
          />
        </Section>
      </ScrollView>

      <OptionPicker
        visible={activePicker === 'pitchRate'}
        title="音高检测频率"
        options={[
          { label: '50 Hz（省电）', value: 50 },
          { label: '100 Hz（默认）', value: 100 },
          { label: '200 Hz（高精度）', value: 200 },
          { label: '400 Hz（超高精度）', value: 400 },
        ]}
        selected={settings.pitchDetectionRate}
        onSelect={v => save({ ...settings, pitchDetectionRate: v })}
        onClose={() => setActivePicker(null)}
      />

      <OptionPicker
        visible={activePicker === 'triggerVolume'}
        title="触发音量"
        options={[
          { label: '-50 dB（较敏感）', value: -50 },
          { label: '-60 dB', value: -60 },
          { label: '-70 dB（默认）', value: -70 },
          { label: '-80 dB（不敏感）', value: -80 },
        ]}
        selected={settings.triggerVolume}
        onSelect={v => save({ ...settings, triggerVolume: v })}
        onClose={() => setActivePicker(null)}
      />

      <OptionPicker
        visible={activePicker === 'duration'}
        title="录音时长限制"
        options={[
          { label: '1 分钟（测试用）', value: 60 },
          { label: '5 分钟', value: 300 },
          { label: '10 分钟（默认）', value: 600 },
          { label: '30 分钟', value: 1800 },
          { label: '无限制', value: 0 },
        ]}
        selected={settings.recordingDurationLimit}
        onSelect={v => save({ ...settings, recordingDurationLimit: v })}
        onClose={() => setActivePicker(null)}
      />

      <OptionPicker
        visible={activePicker === 'leftDisplay'}
        title="左 Y 轴音符名称"
        options={noteDisplayOptions}
        selected={settings.leftYAxisDisplay}
        onSelect={v => save({ ...settings, leftYAxisDisplay: v })}
        onClose={() => setActivePicker(null)}
      />

      <OptionPicker
        visible={activePicker === 'rightDisplay'}
        title="右 Y 轴音符名称"
        options={noteDisplayOptions}
        selected={settings.rightYAxisDisplay}
        onSelect={v => save({ ...settings, rightYAxisDisplay: v })}
        onClose={() => setActivePicker(null)}
      />
    </SafeAreaView>
  )
}

const main = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
    backgroundColor: '#F2F2F7',
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { paddingTop: 20, paddingBottom: 40 },
})
