import { NOTE_NAMES, MIDI_OFFSET } from '../config/constants'

// 频率转MIDI音符编号
export function freqToMidi(freq: number): number {
  if (freq <= 0) return -1
  return Math.round(12 * Math.log2(freq / 440) + 69)
}

// MIDI音符编号转频率
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// MIDI音符编号转音符名（如C4）
export function midiToNoteName(midi: number): string {
  if (midi < 0 || midi > 127) return ''
  const octave = Math.floor(midi / 12) - 1
  const noteIndex = midi % 12
  return `${NOTE_NAMES[noteIndex]}${octave}`
}

// 音符名转MIDI编号
export function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([CDEFGAB]#?)(-?\d+)$/)
  if (!match) return -1

  const note = match[1]
  const octave = parseInt(match[2], 10)
  const noteIndex = NOTE_NAMES.indexOf(note as any)

  if (noteIndex === -1) return -1
  return (octave + 1) * 12 + noteIndex
}

// 音符名转频率
export function noteNameToFreq(noteName: string): number {
  const midi = noteNameToMidi(noteName)
  if (midi === -1) return 0
  return midiToFreq(midi)
}

// 获取两个音符之间的MIDI距离
export function getMidiDistance(note1: string, note2: string): number {
  const midi1 = noteNameToMidi(note1)
  const midi2 = noteNameToMidi(note2)
  if (midi1 === -1 || midi2 === -1) return 0
  return midi2 - midi1
}

// 计算音分偏差（100音分 = 1半音）
export function getCentsDeviation(freq1: number, freq2: number): number {
  if (freq1 <= 0 || freq2 <= 0) return 0
  return 1200 * Math.log2(freq1 / freq2)
}

// 判断音高是否准确
export function isPitchAccurate(targetFreq: number, actualFreq: number, thresholdCents: number): boolean {
  const cents = Math.abs(getCentsDeviation(actualFreq, targetFreq))
  return cents <= thresholdCents
}
