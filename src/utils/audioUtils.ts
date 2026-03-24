import { noteNameToFreq, midiToNoteName } from './noteUtils'
import Sound from 'react-native-sound'

// 升调 → 降调 映射（音频文件用降调命名）
const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb'
}

type SoundMap = Map<string, Sound>

class AudioPlayer {
  private soundCache: SoundMap = new Map()

  constructor() {
    console.log('[AudioPlayer] constructor, calling Sound.setCategory(Playback)')
    Sound.setCategory('Playback')
  }

  private getFileName(noteName: string): string {
    const match = noteName.match(/^([CDEFGAB]#?)(-?\d+)$/)
    if (!match) return noteName

    let note = match[1]
    const octave = match[2]

    if (note.includes('#')) {
      note = SHARP_TO_FLAT[note] || note
    }

    return `${note}${octave}.mp3`
  }

  private loadSound(noteName: string): Promise<Sound | null> {
    if (this.soundCache.has(noteName)) {
      console.log(`[AudioPlayer] loadSound: cache hit for ${noteName}`)
      return Promise.resolve(this.soundCache.get(noteName)!)
    }

    const fileName = this.getFileName(noteName)
    console.log(`[AudioPlayer] loadSound: loading ${fileName}`)

    return new Promise((resolve) => {
      const sound = new Sound(fileName, Sound.MAIN_BUNDLE, (error) => {
        if (error) {
          console.log(`[AudioPlayer] loadSound: FAILED to load ${fileName}:`, JSON.stringify(error))
          resolve(null)
        } else {
          console.log(`[AudioPlayer] loadSound: OK ${fileName}`)
          this.soundCache.set(noteName, sound)
          resolve(sound)
        }
      })
    })
  }

  async playNote(noteName: string, duration: number = 0.5): Promise<void> {
    console.log(`[AudioPlayer] playNote: ${noteName}, calling setCategory(Playback)`)
    Sound.setCategory('Playback')
    Sound.setActive(true)
    const sound = await this.loadSound(noteName)
    if (sound) {
      console.log(`[AudioPlayer] playNote: got sound, calling play()`)
      sound.stop()
      sound.setVolume(1.0)
      sound.play((success) => {
        console.log(`[AudioPlayer] play() callback: success=${success}`)
        if (!success) console.log('[AudioPlayer] Playback failed')
      })
    } else {
      console.log(`[AudioPlayer] playNote: no sound object for ${noteName}`)
    }
  }

  stopAll(): void {
    this.soundCache.forEach((sound) => {
      try { sound.stop() } catch {}
    })
  }

  release(): void {
    this.soundCache.forEach((sound) => {
      try { sound.release() } catch {}
    })
    this.soundCache.clear()
  }
}

export const audioPlayer = new AudioPlayer()
