import { useState, useRef, useCallback } from 'react'
import { Alert } from 'react-native'
import { loadTemplates, loadTemplatePitchData, resolveTemplateAudioPath } from '../services/templateStorage'
import { noteNameToMidi } from '../utils/noteUtils'
import { PRESET_MODES } from '../config/constants'
import { PitchTemplate, PitchDataPoint } from '../types'

export interface UseTemplateAudioOptions {
  currentModeId: string
  customModes: any[]
}

export interface UseTemplateAudioResult {
  selectedTemplate: PitchTemplate | null
  templatePitchData: PitchDataPoint[]
  templateAudioPath: string
  templateModalVisible: boolean
  templates: PitchTemplate[]
  templateSoundRef: React.MutableRefObject<any>
  openTemplateModal: () => Promise<void>
  selectTemplate: (template: PitchTemplate | null) => Promise<void>
  setTemplateModalVisible: (v: boolean) => void
  startTemplateAudio: (template: PitchTemplate) => void
  stopTemplateSound: () => void
  pauseTemplateAudio: () => void
  resumeTemplateAudio: () => void
  reloadTemplates: (currentSelected: PitchTemplate | null) => Promise<void>
  resetTemplate: () => void
}

export function useTemplateAudio({ currentModeId, customModes }: UseTemplateAudioOptions): UseTemplateAudioResult {
  const [selectedTemplate, setSelectedTemplate] = useState<PitchTemplate | null>(null)
  const [templatePitchData, setTemplatePitchData] = useState<PitchDataPoint[]>([])
  const [templateAudioPath, setTemplateAudioPath] = useState<string>('')
  const [templateModalVisible, setTemplateModalVisible] = useState(false)
  const [templates, setTemplates] = useState<PitchTemplate[]>([])

  const templateSoundRef = useRef<any>(null)

  const stopTemplateSound = useCallback(() => {
    if (templateSoundRef.current) {
      templateSoundRef.current.stop()
      templateSoundRef.current.release()
      templateSoundRef.current = null
    }
  }, [])

  const pauseTemplateAudio = useCallback(() => {
    templateSoundRef.current?.pause()
  }, [])

  const resumeTemplateAudio = useCallback(() => {
    if (!templateSoundRef.current) return
    templateSoundRef.current.play(() => {
      if (templateSoundRef.current) {
        templateSoundRef.current.release()
        templateSoundRef.current = null
      }
    })
  }, [])

  const startTemplateAudio = useCallback((template: PitchTemplate) => {
    stopTemplateSound()
    const path = templateAudioPath
    if (!path) return
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SoundModule = require('react-native-sound')
    const Sound = SoundModule.default ?? SoundModule
    const sound = new Sound(path, '', (error: any) => {
      if (error || templateSoundRef.current !== sound) {
        sound.release()
        return
      }
      sound.play(() => {
        if (templateSoundRef.current === sound) {
          sound.release()
          templateSoundRef.current = null
        }
      })
    })
    templateSoundRef.current = sound
  }, [templateAudioPath, stopTemplateSound])

  const openTemplateModal = useCallback(async () => {
    const list = await loadTemplates()
    setTemplates(list)
    setTemplateModalVisible(true)
  }, [])

  const selectTemplate = useCallback(async (template: PitchTemplate | null) => {
    setTemplateModalVisible(false)
    if (!template) {
      setSelectedTemplate(null)
      setTemplatePitchData([])
      setTemplateAudioPath('')
      return
    }

    if (template.minNote && template.maxNote) {
      const allModes = [...PRESET_MODES, ...customModes]
      const mode = allModes.find(m => m.id === currentModeId) || PRESET_MODES[0]
      const modeMidi = { min: noteNameToMidi(mode.startNote), max: noteNameToMidi(mode.endNote) }
      const tmplMidi = { min: noteNameToMidi(template.minNote), max: noteNameToMidi(template.maxNote) }
      const outOfRange = tmplMidi.min < modeMidi.min || tmplMidi.max > modeMidi.max
      if (outOfRange) {
        const confirmed = await new Promise<boolean>(resolve => {
          Alert.alert(
            '模版使用确认',
            `模板音高范围（${template.minNote}–${template.maxNote}）超出当前练习范围（${mode.startNote}–${mode.endNote}），超出部分将不展示。`,
            [
              { text: '取消', style: 'cancel', onPress: () => resolve(false) },
              { text: '继续', onPress: () => resolve(true) },
            ]
          )
        })
        if (!confirmed) return
      }
    }

    setSelectedTemplate(template)
    const loaded = await loadTemplatePitchData(template.pitchDataKey)
    setTemplatePitchData(loaded?.data ?? [])
    const audioPath = await resolveTemplateAudioPath(template)
    setTemplateAudioPath(audioPath)
  }, [currentModeId, customModes])

  const reloadTemplates = useCallback(async (currentSelected: PitchTemplate | null) => {
    const list = await loadTemplates()
    setTemplates(list)
    if (currentSelected) {
      const still = list.find(t => t.id === currentSelected.id)
      if (!still) {
        setSelectedTemplate(null)
        setTemplatePitchData([])
        setTemplateAudioPath('')
      } else if (still.name !== currentSelected.name) {
        setSelectedTemplate(still)
      }
    }
  }, [])

  const resetTemplate = useCallback(() => {
    setSelectedTemplate(null)
    setTemplatePitchData([])
    setTemplateAudioPath('')
  }, [])

  return {
    selectedTemplate,
    templatePitchData,
    templateAudioPath,
    templateModalVisible,
    templates,
    templateSoundRef,
    openTemplateModal,
    selectTemplate,
    setTemplateModalVisible,
    startTemplateAudio,
    stopTemplateSound,
    pauseTemplateAudio,
    resumeTemplateAudio,
    reloadTemplates,
    resetTemplate,
  }
}
