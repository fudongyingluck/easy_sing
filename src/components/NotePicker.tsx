import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native'
import { NOTE_NAMES } from '../config/constants'
import { noteNameToMidi, midiToNoteName } from '../utils/noteUtils'

interface NotePickerProps {
  visible: boolean
  selectedNote: string
  minNote?: string
  maxNote?: string
  onSelect: (note: string) => void
  onClose: () => void
}

// 生成所有可选音符（从C1到C8）
const generateAllNotes = () => {
  const notes: string[] = []
  for (let octave = 1; octave <= 8; octave++) {
    for (const noteName of NOTE_NAMES) {
      notes.push(`${noteName}${octave}`)
    }
  }
  return notes
}

const ALL_NOTES = generateAllNotes()

export function NotePicker({ visible, selectedNote, minNote, maxNote, onSelect, onClose }: NotePickerProps) {
  const [scrollIndex, setScrollIndex] = useState(0)

  // 筛选可选音符范围
  const filteredNotes = ALL_NOTES.filter(note => {
    const midi = noteNameToMidi(note)
    const minMidi = minNote ? noteNameToMidi(minNote) : -Infinity
    const maxMidi = maxNote ? noteNameToMidi(maxNote) : Infinity
    return midi >= minMidi && midi <= maxMidi
  })

  // 找到当前选中音符的位置
  useEffect(() => {
    if (visible && selectedNote) {
      const index = filteredNotes.indexOf(selectedNote)
      if (index >= 0) {
        setScrollIndex(index)
      }
    }
  }, [visible, selectedNote, filteredNotes])

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelButton}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.title}>选择音符</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={styles.list}>
            {filteredNotes.map((note, index) => (
              <TouchableOpacity
                key={note}
                style={[
                  styles.noteItem,
                  note === selectedNote && styles.noteItemSelected
                ]}
                onPress={() => {
                  onSelect(note)
                  onClose()
                }}
              >
                <Text style={[
                  styles.noteText,
                  note === selectedNote && styles.noteTextSelected
                ]}>
                  {note}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  cancelButton: {
    fontSize: 16,
    color: '#64B5F6',
    width: 60
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  list: {
    maxHeight: 400
  },
  noteItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  noteItemSelected: {
    backgroundColor: '#E1F5FE'
  },
  noteText: {
    fontSize: 18,
    textAlign: 'center'
  },
  noteTextSelected: {
    color: '#64B5F6',
    fontWeight: 'bold'
  }
})
