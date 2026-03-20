// 全局常量配置
export const CONFIG = {
  // 音高曲线
  DEFAULT_CHART_DURATION: 5,      // 默认显示最近5秒
  PITCH_DATA_SAMPLE_RATE: 10,    // 每秒保存10个音高数据点（可调整）

  // 钢琴
  PIANO_HEIGHT_RATIO: 0.33,      // 钢琴占屏幕高度1/3
  WHITE_KEY_MIN_WIDTH: 36,        // 白键最小宽度36px
  DOUBLE_TAP_DELAY: 300,          // 双击检测间隔300ms

  // 音高检测
  PITCH_ACCURACY_THRESHOLD: 10,  // ±10音分算准确

  // 存储
  STORAGE_WARNING_THRESHOLD: 8,  // 8MB提示清理
  AUTO_CLEAN_DAYS: 10,            // 默认清理10天前的录音

  // 录音
  MAX_RECORDING_DURATION: 600,    // 最长10分钟(600秒)

  // 模式
  MAX_CUSTOM_MODES: 20,            // 最多20个自定义模式

  // YIN算法
  YIN_THRESHOLD: 0.15,
  YIN_SAMPLE_RATE: 22050,
  YIN_BUFFER_SIZE: 2048,
  YIN_OVERLAP: 0.5,
  YIN_CONFIDENCE_THRESHOLD: 0.85
} as const

// 预设音域模式
export const PRESET_MODES = [
  { id: 'male', name: '男声', icon: 'man', startNote: 'E2', endNote: 'C5', minFreq: 80, maxFreq: 520 },
  { id: 'female', name: '女声', icon: 'woman', startNote: 'C3', endNote: 'C6', minFreq: 160, maxFreq: 1040 },
  { id: 'guitar', name: '吉他', icon: 'guitar-outline', startNote: 'E2', endNote: 'E6', minFreq: 82, maxFreq: 1319 },
  { id: 'violin', name: '小提琴', icon: 'musical-notes-outline', startNote: 'G3', endNote: 'E7', minFreq: 196, maxFreq: 2637 }
] as const

// 音符名称映射
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// MIDI音符编号对应（C4 = 60）
export const MIDI_OFFSET = 12  // C0 = 0
