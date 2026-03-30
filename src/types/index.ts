// 音高数据点
export interface PitchDataPoint {
  time: number      // 时间戳（秒）
  freq: number      // 频率（Hz），0表示无效
  note: string | null // 音符名，如"C4"，null表示无效
}

// 音高数据文件
export interface PitchData {
  version: number
  sampleRate: number  // 每秒数据点数
  duration: number    // 总时长（秒）
  data: PitchDataPoint[]
}

// 录音记录
export interface Recording {
  id: string
  name: string
  audioFilePath: string
  pitchDataKey: string
  duration: number    // 秒
  fileSize: number    // 字节
  createTime: string  // ISO日期字符串
}

// 音域模式
export interface Mode {
  id: string
  name: string
  startNote: string
  endNote: string
  minFreq: number
  maxFreq: number
  isCustom?: boolean
}

// 用户设置
export interface UserSettings {
  currentModeId: string
  customModes: Mode[]
  lastUpdated: string
  // 音高检测
  pitchDetectionRate: 50 | 100 | 200 | 400
  triggerVolume: number
  // 录音
  recordingDurationLimit: number  // 秒，0 表示无限制
  autoStopOnLowVolume: boolean
  // 显示
  leftYAxisDisplay: 'english' | 'solfege' | 'number'
  rightYAxisDisplay: 'english' | 'solfege' | 'number'
  showBothYAxes: boolean
  themeMode: 'light' | 'dark' | 'system'
}

// 应用状态
export type AppMode = 'recording' | 'piano'

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'
