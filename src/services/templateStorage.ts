import AsyncStorage from '@react-native-async-storage/async-storage'
import RNFS from 'react-native-fs'
import { PitchTemplate, PitchData, Recording } from '../types'
import { nativePitchRecorder } from './nativePitchRecorder'

const TEMPLATES_KEY = '@pitchperfect:templates'
const IMPORTS_DIR = `${RNFS.DocumentDirectoryPath}/PitchPerfect/Imports`

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

/** 提取纯文件名（去掉目录部分） */
function toFilename(path: string): string {
  return path.includes('/') ? path.split('/').pop()! : path
}

/** 解析模板音频完整路径（async）
 *  - exist_record  → resolveRecordingPath(filename)，在当前容器 Recordings/ 动态定位
 *  - file / deleted_record / undefined / 旧值  → Imports/ 目录
 */
export async function resolveTemplateAudioPath(template: PitchTemplate): Promise<string> {
  const filename = toFilename(template.audioFilePath)
  // 兼容旧值 'recording'
  if (template.audioSource === 'exist_record' || (template.audioSource as string) === 'recording') {
    return nativePitchRecorder.resolveRecordingPath(filename)
  }
  return `${IMPORTS_DIR}/${filename}`
}

/** 从录音历史直接创建模板引用，不复制任何数据 */
export async function createTemplateFromRecording(recording: Recording): Promise<PitchTemplate> {
  const templateId = `${Date.now()}_${Math.random().toString(36).slice(2)}`
  const template: PitchTemplate = {
    id: templateId,
    name: recording.name,
    sourceFileName: recording.name,
    audioFilePath: toFilename(recording.audioFilePath),
    audioSource: 'exist_record',
    pitchDataKey: recording.pitchDataKey,
    duration: recording.duration,
    createTime: new Date().toISOString(),
    sourceRecordingId: recording.id,
  }
  await addTemplate(template)
  return template
}

/** 删除模板；exist_record 不动原录音文件，其余清理 Imports/ 文件和音高数据 */
export async function deleteTemplate(template: PitchTemplate): Promise<void> {
  const list = await loadTemplates()
  await saveTemplates(list.filter(t => t.id !== template.id))

  const src = template.audioSource as string
  const isLiveRecording = src === 'exist_record' || src === 'recording' || !!template.sourceRecordingId
  if (!isLiveRecording) {
    if (template.pitchDataKey) {
      try { await AsyncStorage.removeItem(template.pitchDataKey) } catch {}
    }
    try {
      await RNFS.unlink(`${IMPORTS_DIR}/${toFilename(template.audioFilePath)}`)
    } catch {}
  }
}

/** 保存模板音高数据，返回 AsyncStorage key */
export async function saveTemplatePitchData(templateId: string, pitchData: PitchData): Promise<string> {
  const key = `@pitchperfect:pitchdata:template_${templateId}`
  await AsyncStorage.setItem(key, JSON.stringify(pitchData))
  return key
}

/** 查找所有引用了指定录音的模板 */
export async function findTemplatesReferencingRecording(recordingId: string): Promise<PitchTemplate[]> {
  const list = await loadTemplates()
  return list.filter(t => t.sourceRecordingId === recordingId)
}

/** 将「引用录音」的模板迁移为独立的 Imports 文件，用于「删录音但保留模板」场景
 *  1. 复制录音音频文件到 Imports/
 *  2. 复制音高数据到模板独立 key
 *  3. 更新模板 audioSource / pitchDataKey
 */
export async function migrateTemplateToImport(
  template: PitchTemplate,
  recordingFullAudioPath: string,
): Promise<void> {
  await RNFS.mkdir(IMPORTS_DIR)
  const filename = toFilename(template.audioFilePath)
  const destPath = `${IMPORTS_DIR}/${filename}`

  // 复制音频文件
  const exists = await RNFS.exists(recordingFullAudioPath)
  if (exists) {
    await RNFS.copyFile(recordingFullAudioPath, destPath)
  }

  // 复制音高数据到新 key（防止删录音时 pitchDataKey 被一起清掉）
  let newPitchDataKey = template.pitchDataKey
  if (template.pitchDataKey) {
    const raw = await AsyncStorage.getItem(template.pitchDataKey)
    if (raw) {
      newPitchDataKey = `@pitchperfect:pitchdata:template_${template.id}`
      await AsyncStorage.setItem(newPitchDataKey, raw)
    }
  }

  // 更新模板元数据
  const updated: PitchTemplate = {
    ...template,
    audioSource: 'deleted_record',
    pitchDataKey: newPitchDataKey,
    sourceRecordingId: undefined,
  }
  await updateTemplate(updated)
}

/** 读取模板音高数据，key 为空或数据不存在时返回 null */
export async function loadTemplatePitchData(key: string): Promise<PitchData | null> {
  if (!key) return null
  try {
    const raw = await AsyncStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      delete parsed.sampleRate
      return parsed
    }
    return null
  } catch {
    return null
  }
}
