import AsyncStorage from '@react-native-async-storage/async-storage'
import RNFS from 'react-native-fs'
import { UserSettings, Recording, PitchData, Mode } from '../types'
import { PRESET_MODES } from '../config/constants'
import { nativePitchRecorder } from './nativePitchRecorder'

// Storage keys
const SETTINGS_KEY = '@pitchperfect:settings'
const RECORDINGS_KEY = '@pitchperfect:recordings'

// 默认设置
const defaultSettings: UserSettings = {
  currentModeId: 'female',
  customModes: [],
  lastUpdated: new Date().toISOString(),
  pitchDetectionRate: 100,
  triggerVolume: -70,
  recordingDurationLimit: 600,
  autoStopOnLowVolume: false,
  leftYAxisDisplay: 'english',
  rightYAxisDisplay: 'english',
  showBothYAxes: true,
  themeMode: 'system',
  rememberLastTemplate: false,
}

// 初始化存储
export async function initStorage(): Promise<void> {
  try {
    // 确保有默认设置
    const existing = await loadUserSettings()
    if (!existing) {
      await saveUserSettings(defaultSettings)
    }
    console.log('Storage initialized')
  } catch (error) {
    console.error('Failed to init storage:', error)
  }
}

// 加载用户设置
export async function loadUserSettings(): Promise<UserSettings> {
  try {
    const data = await AsyncStorage.getItem(SETTINGS_KEY)
    if (data) {
      // 与默认值合并，保证旧数据也能获得新字段
      return { ...defaultSettings, ...JSON.parse(data) }
    }
    return defaultSettings
  } catch (error) {
    console.error('Failed to load settings:', error)
    return defaultSettings
  }
}

// 保存用户设置
export async function saveUserSettings(settings: UserSettings): Promise<void> {
  try {
    settings.lastUpdated = new Date().toISOString()
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Failed to save settings:', error)
  }
}

// 加载录音列表
export async function loadRecordings(): Promise<Recording[]> {
  try {
    const data = await AsyncStorage.getItem(RECORDINGS_KEY)
    if (data) {
      const recordings = JSON.parse(data)
      // 兼容旧字段名 pitchDataPath → pitchDataKey
      return recordings.map((r: any) => ({
        ...r,
        pitchDataKey: r.pitchDataKey ?? r.pitchDataPath,
      }))
    }
    return []
  } catch (error) {
    console.error('Failed to load recordings:', error)
    return []
  }
}

// 保存录音列表
export async function saveRecordings(recordings: Recording[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECORDINGS_KEY, JSON.stringify(recordings))
  } catch (error) {
    console.error('Failed to save recordings:', error)
  }
}

// 保存音高数据
export async function savePitchData(recordingId: string, pitchData: PitchData): Promise<string> {
  try {
    const key = `@pitchperfect:pitch:${recordingId}`
    await AsyncStorage.setItem(key, JSON.stringify(pitchData))
    return key
  } catch (error) {
    console.error('Failed to save pitch data:', error)
    return `@pitchperfect:pitch:${recordingId}`
  }
}

// 加载音高数据
export async function loadPitchData(filePath: string): Promise<PitchData | null> {
  try {
    const data = await AsyncStorage.getItem(filePath)
    if (data) {
      const parsed = JSON.parse(data)
      // 兼容旧数据：删除不再使用的 sampleRate 字段
      delete parsed.sampleRate
      return parsed
    }
    return null
  } catch (error) {
    console.error('Failed to load pitch data:', error)
    return null
  }
}

// 删除录音文件
export async function deleteRecordingFiles(recording: Recording): Promise<void> {
  try {
    // 删除音高数据
    if (recording.pitchDataKey) {
      await AsyncStorage.removeItem(recording.pitchDataKey)
    }
    // 删除音频文件
    if (recording.audioFilePath) {
      try {
        const exists = await RNFS.exists(recording.audioFilePath)
        if (exists) await RNFS.unlink(recording.audioFilePath)
      } catch (e) {
        console.warn('Failed to delete audio file:', recording.audioFilePath, e)
      }
    }
  } catch (error) {
    console.error('Failed to delete recording files:', error)
  }
}

/**
 * 解析音频文件的当前有效绝对路径（单一出口）。
 *
 * ⚠️ 不要绕过这个函数直接使用存储的路径：
 *   iOS 沙盒 UUID 随应用更新/重装变化，直接使用旧绝对路径会报错。
 *
 * 规则：
 *   - 包含 /Imports/ 的路径（外部导入文件）→ 直接返回，路径由我们写入沙盒，始终有效
 *   - 其他路径（录音文件）→ 提取文件名，走 resolveRecordingPath 获取当前有效路径
 */
export async function resolveAudioPath(filePath: string): Promise<string> {
  if (filePath.includes('/Imports/')) {
    return filePath
  }
  const filename = filePath.split('/').pop() ?? filePath
  return nativePitchRecorder.resolveRecordingPath(filename)
}

// 计算存储使用量
export async function getStorageUsage(): Promise<number> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    let totalSize = 0
    for (const key of keys) {
      const data = await AsyncStorage.getItem(key)
      if (data) {
        totalSize += data.length * 2 // 粗略估计 UTF-16
      }
    }
    return totalSize / (1024 * 1024) // 返回 MB
  } catch (error) {
    console.error('Failed to calculate storage usage:', error)
    return 0
  }
}
