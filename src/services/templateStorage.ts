import AsyncStorage from '@react-native-async-storage/async-storage'
import RNFS from 'react-native-fs'
import { PitchTemplate, PitchData } from '../types'

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

/** 更新已有模板（按 id 匹配替换） */
export async function updateTemplate(updated: PitchTemplate): Promise<void> {
  const list = await loadTemplates()
  await saveTemplates(list.map(t => t.id === updated.id ? updated : t))
}

/** 删除模板元数据；若来源为导入文件则同时删除音频文件和音高数据 */
export async function deleteTemplate(template: PitchTemplate): Promise<void> {
  const list = await loadTemplates()
  await saveTemplates(list.filter(t => t.id !== template.id))

  if (!template.sourceRecordingId) {
    if (template.pitchDataKey) {
      try { await AsyncStorage.removeItem(template.pitchDataKey) } catch {}
    }
    if (template.audioFilePath) {
      try {
        const fullPath = `${RNFS.DocumentDirectoryPath}/PitchPerfect/Imports/${template.audioFilePath}`
        if (await RNFS.exists(fullPath)) await RNFS.unlink(fullPath)
      } catch {}
    }
  }
}

/** 保存模板音高数据，返回 AsyncStorage key */
export async function saveTemplatePitchData(templateId: string, pitchData: PitchData): Promise<string> {
  const key = `@pitchperfect:pitchdata:template_${templateId}`
  await AsyncStorage.setItem(key, JSON.stringify(pitchData))
  return key
}

/** 读取模板音高数据，key 为空或数据不存在时返回 null */
export async function loadTemplatePitchData(key: string): Promise<PitchData | null> {
  if (!key) return null
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
