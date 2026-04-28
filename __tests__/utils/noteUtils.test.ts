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
