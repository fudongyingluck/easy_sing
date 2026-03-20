import { noteNameToFreq, midiToNoteName } from './noteUtils'
import Sound from 'react-native-sound'

// 配置
const AUDIO_CONFIG = {
  // 按优先级排序的音频格式
  extensions: ['.mp3', '.m4a', '.wav'],
  // 默认优先格式
  primaryExtension: '.mp3'
} as const

// 升调 → 降调 映射（因为音频文件用降调命名）
const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb'
}

// 设置音频类别
Sound.setCategory('Playback', true)

// 音频文件类型
type SoundMap = Map<string, Sound>

class AudioPlayer {
  private soundCache: SoundMap = new Map()
  private isInitialized = false
  private basePath: string = ''

  constructor() {
    this.init()
  }

  private async init() {
    try {
      this.isInitialized = true
      console.log('AudioPlayer initialized')
    } catch (error) {
      console.log('AudioPlayer init failed:', error)
    }
  }

  // 获取音频文件名（处理升号，如 C#4 变成 Db4）
  private getFileName(noteName: string): string {
    // 分离音符和八度
    const match = noteName.match(/^([CDEFGAB]#?)(-?\d+)$/)
    if (!match) return noteName

    let note = match[1]
    const octave = match[2]

    // 如果是升调，转换为对应的降调
    if (note.includes('#')) {
      note = SHARP_TO_FLAT[note] || note
    }

    return `${note}${octave}`
  }

  // 预加载常用音符
  async preloadNotes(startNote: string = 'C3', endNote: string = 'C6') {
    console.log('Preloading piano notes...')

    const startMidi = noteNameToFreq(startNote) > 0 ?
      // 这里需要反向转换，我们简化处理
      48 : 48 // C3
    const endMidi = 84 // C6

    for (let midi = startMidi; midi <= endMidi; midi++) {
      const noteName = midiToNoteName(midi)
      await this.loadSound(noteName)
    }

    console.log(`Preloaded ${this.soundCache.size} notes`)
  }

  // 加载单个音符
  private async loadSound(noteName: string): Promise<Sound | null> {
    // 检查缓存
    if (this.soundCache.has(noteName)) {
      return this.soundCache.get(noteName)!
    }

    const fileName = this.getFileName(noteName)

    // 按优先级尝试各种格式
    return this.tryLoadSoundFormats(fileName, noteName, 0)
  }

  // 递归尝试不同格式
  private tryLoadSoundFormats(
    fileName: string,
    noteName: string,
    formatIndex: number
  ): Promise<Sound | null> {
    return new Promise((resolve) => {
      if (formatIndex >= AUDIO_CONFIG.extensions.length) {
        console.log(`Failed to load ${fileName} with all formats`)
        resolve(null)
        return
      }

      const ext = AUDIO_CONFIG.extensions[formatIndex]
      const sound = new Sound(`${fileName}${ext}`, Sound.MAIN_BUNDLE, (error) => {
        if (error) {
          console.log(`Failed to load ${fileName}${ext}, trying next format...`)
          // 尝试下一个格式
          resolve(this.tryLoadSoundFormats(fileName, noteName, formatIndex + 1))
        } else {
          this.soundCache.set(noteName, sound)
          resolve(sound)
        }
      })
    })
  }

  // 播放指定音符
  async playNote(noteName: string, duration: number = 0.5): Promise<void> {
    if (!this.isInitialized) {
      console.log('AudioPlayer not initialized')
      return
    }

    console.log(`Playing note: ${noteName}`)

    try {
      const sound = await this.loadSound(noteName)

      if (sound) {
        // 停止当前播放的同一音符
        sound.stop()

        // 重新播放
        sound.setVolume(1.0)
        sound.play((success) => {
          if (!success) {
            console.log('Playback failed')
          }
        })
      } else {
        // 如果没有音频文件，至少打印日志
        const freq = noteNameToFreq(noteName)
        console.log(`[Audio] ${noteName} (${freq}Hz) - Add audio files to hear sound!`)
      }
    } catch (error) {
      console.error('Error playing note:', error)
    }
  }

  // 停止所有声音
  async stopAll(): Promise<void> {
    this.soundCache.forEach((sound) => {
      try {
        sound.stop()
      } catch (e) {
        // 忽略错误
      }
    })
  }

  // 清理资源
  async release(): Promise<void> {
    this.soundCache.forEach((sound) => {
      try {
        sound.release()
      } catch (e) {
        // 忽略错误
      }
    })
    this.soundCache.clear()
  }

  // 播放频率（兼容旧接口）
  async playTone(frequency: number, duration: number = 0.5): Promise<void> {
    console.log(`Playing tone: ${frequency}Hz`)
    // 这里可以添加频率到音符的转换
  }
}

// 单例
export const audioPlayer = new AudioPlayer()
