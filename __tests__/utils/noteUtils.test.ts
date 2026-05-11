import {
  freqToMidi,
  midiToFreq,
  midiToNoteName,
  noteNameToMidi,
  getCentsDeviation,
  isPitchAccurate,
} from '../../src/utils/noteUtils'

describe('freqToMidi', () => {
  it('A4 (440Hz) → 69', () => {
    expect(freqToMidi(440)).toBe(69)
  })

  it('C4 (261.63Hz) → 60', () => {
    expect(freqToMidi(261.63)).toBe(60)
  })

  it('A5 (880Hz) → 81', () => {
    expect(freqToMidi(880)).toBe(81)
  })

  it('A3 (220Hz) → 57', () => {
    expect(freqToMidi(220)).toBe(57)
  })

  it('零或负频率返回 -1', () => {
    expect(freqToMidi(0)).toBe(-1)
    expect(freqToMidi(-10)).toBe(-1)
  })
})

describe('midiToNoteName', () => {
  it('MIDI 60 → C4', () => {
    expect(midiToNoteName(60)).toBe('C4')
  })

  it('MIDI 69 → A4', () => {
    expect(midiToNoteName(69)).toBe('A4')
  })

  it('MIDI 61 → C#4', () => {
    expect(midiToNoteName(61)).toBe('C#4')
  })

  it('MIDI 0 → C-1', () => {
    expect(midiToNoteName(0)).toBe('C-1')
  })

  it('超出范围返回空字符串', () => {
    expect(midiToNoteName(-1)).toBe('')
    expect(midiToNoteName(128)).toBe('')
  })
})

describe('noteNameToMidi', () => {
  it('C4 → 60', () => {
    expect(noteNameToMidi('C4')).toBe(60)
  })

  it('A4 → 69', () => {
    expect(noteNameToMidi('A4')).toBe(69)
  })

  it('C#4 → 61', () => {
    expect(noteNameToMidi('C#4')).toBe(61)
  })

  it('C3 → 48', () => {
    expect(noteNameToMidi('C3')).toBe(48)
  })

  it('freqToMidi / midiToNoteName 互为逆运算', () => {
    expect(noteNameToMidi(midiToNoteName(60))).toBe(60)
    expect(noteNameToMidi(midiToNoteName(69))).toBe(69)
    expect(noteNameToMidi(midiToNoteName(48))).toBe(48)
  })

  it('无效字符串返回 -1', () => {
    expect(noteNameToMidi('')).toBe(-1)
    expect(noteNameToMidi('X4')).toBe(-1)
    expect(noteNameToMidi('C')).toBe(-1)
  })
})

describe('midiToFreq', () => {
  it('MIDI 69 → 440Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 2)
  })

  it('MIDI 57 → 220Hz（低八度）', () => {
    expect(midiToFreq(57)).toBeCloseTo(220, 2)
  })

  it('MIDI 81 → 880Hz（高八度）', () => {
    expect(midiToFreq(81)).toBeCloseTo(880, 2)
  })
})

describe('getCentsDeviation', () => {
  it('相同频率偏差 0 音分', () => {
    expect(getCentsDeviation(440, 440)).toBeCloseTo(0, 5)
  })

  it('高一倍频偏差 +1200 音分', () => {
    expect(getCentsDeviation(880, 440)).toBeCloseTo(1200, 2)
  })

  it('低一倍频偏差 -1200 音分', () => {
    expect(getCentsDeviation(220, 440)).toBeCloseTo(-1200, 2)
  })

  it('零频率返回 0', () => {
    expect(getCentsDeviation(0, 440)).toBe(0)
    expect(getCentsDeviation(440, 0)).toBe(0)
  })
})

describe('freqToMidiFloat', () => {
  it('A4 (440Hz) → 69.0（精确）', () => {
    const { freqToMidiFloat } = require('../../src/utils/noteUtils')
    expect(freqToMidiFloat(440)).toBeCloseTo(69, 10)
  })

  it('A4+50音分 → 69.5', () => {
    const { freqToMidiFloat } = require('../../src/utils/noteUtils')
    const halfSemitone = 440 * Math.pow(2, 0.5 / 12)
    expect(freqToMidiFloat(halfSemitone)).toBeCloseTo(69.5, 5)
  })

  it('与 freqToMidi 差值在 ±0.5 内（取整一致）', () => {
    const { freqToMidi, freqToMidiFloat } = require('../../src/utils/noteUtils')
    expect(Math.abs(freqToMidiFloat(440) - freqToMidi(440))).toBeLessThan(0.5)
    expect(Math.abs(freqToMidiFloat(261.63) - freqToMidi(261.63))).toBeLessThan(0.5)
  })
})

describe('noteNameToFreq', () => {
  it('A4 → 440Hz', () => {
    const { noteNameToFreq } = require('../../src/utils/noteUtils')
    expect(noteNameToFreq('A4')).toBeCloseTo(440, 2)
  })

  it('A5 → 880Hz（高八度）', () => {
    const { noteNameToFreq } = require('../../src/utils/noteUtils')
    expect(noteNameToFreq('A5')).toBeCloseTo(880, 2)
  })

  it('无效字符串返回 0', () => {
    const { noteNameToFreq } = require('../../src/utils/noteUtils')
    expect(noteNameToFreq('')).toBe(0)
    expect(noteNameToFreq('X4')).toBe(0)
  })

  it('与 noteNameToMidi + midiToFreq 结果一致', () => {
    const { noteNameToFreq, noteNameToMidi, midiToFreq } = require('../../src/utils/noteUtils')
    expect(noteNameToFreq('C4')).toBeCloseTo(midiToFreq(noteNameToMidi('C4')), 5)
  })
})

describe('getMidiDistance', () => {
  it('C4 到 A4 → 9 半音', () => {
    const { getMidiDistance } = require('../../src/utils/noteUtils')
    expect(getMidiDistance('C4', 'A4')).toBe(9)
  })

  it('A4 到 C4 → -9（负方向）', () => {
    const { getMidiDistance } = require('../../src/utils/noteUtils')
    expect(getMidiDistance('A4', 'C4')).toBe(-9)
  })

  it('相同音符 → 0', () => {
    const { getMidiDistance } = require('../../src/utils/noteUtils')
    expect(getMidiDistance('C4', 'C4')).toBe(0)
  })

  it('C4 到 C5 → 12 半音（一个八度）', () => {
    const { getMidiDistance } = require('../../src/utils/noteUtils')
    expect(getMidiDistance('C4', 'C5')).toBe(12)
  })

  it('无效音符返回 0', () => {
    const { getMidiDistance } = require('../../src/utils/noteUtils')
    expect(getMidiDistance('X4', 'C4')).toBe(0)
    expect(getMidiDistance('C4', '')).toBe(0)
  })
})

describe('isPitchAccurate', () => {
  it('偏差在阈值内返回 true', () => {
    expect(isPitchAccurate(440, 442, 20)).toBe(true)
  })

  it('偏差超出阈值返回 false', () => {
    expect(isPitchAccurate(440, 460, 10)).toBe(false)
  })

  it('完全一致返回 true', () => {
    expect(isPitchAccurate(440, 440, 0)).toBe(true)
  })
})
