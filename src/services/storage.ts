import AsyncStorage from '@react-native-async-storage/async-storage'
import { UserSettings, Recording, PitchData, Mode } from '../types'
import { PRESET_MODES } from '../config/constants'

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
      return JSON.parse(data)
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
      return JSON.parse(data)
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
    if (recording.pitchDataPath) {
      await AsyncStorage.removeItem(recording.pitchDataPath)
    }
    // 注意：实际音频文件需要用文件系统 API 删除
  } catch (error) {
    console.error('Failed to delete recording files:', error)
  }
}

// 获取录音文件路径
export function getRecordingPath(recordingId: string): string {
  // 实际应用中应该返回文件系统路径
  return `${recordingId}.mp3`
}

// 获取音高数据文件路径
export function getPitchDataPath(recordingId: string): string {
  return `@pitchperfect:pitch:${recordingId}`
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
