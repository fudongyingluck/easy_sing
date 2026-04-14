import AsyncStorage from '@react-native-async-storage/async-storage'
import { PitchTemplate } from '../types'

const TEMPLATES_KEY = '@pitchperfect:templates'

export async function loadTemplates(): Promise<PitchTemplate[]> {
  try {
    const data = await AsyncStorage.getItem(TEMPLATES_KEY)
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('Failed to load templates:', error)
    return []
  }
}

export async function saveTemplates(templates: PitchTemplate[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
  } catch (error) {
    console.error('Failed to save templates:', error)
  }
}

export async function addTemplate(template: PitchTemplate): Promise<void> {
  const list = await loadTemplates()
  await saveTemplates([...list, template])
}

export async function deleteTemplate(id: string): Promise<void> {
  const list = await loadTemplates()
  await saveTemplates(list.filter(t => t.id !== id))
}
