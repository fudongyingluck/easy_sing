import React, { memo } from 'react'
import { View, StyleSheet, Text } from 'react-native'
import Svg, { Line, Text as SvgText, Path, Circle, Rect, Defs, LinearGradient, Stop, ClipPath, G } from 'react-native-svg'
import { PitchDataPoint } from '../types'
import { noteNameToMidi, midiToNoteName } from '../utils/noteUtils'
import { useTheme } from '../context/ThemeContext'

export const X_AXIS_HEIGHT = 30

export const PADDING = { top: 4, bottom: 4, left: 5, right: 10 }
export const pixelsPerSemitone = 20

const LINE_TIME_GAP = 0.25
const LINE_SEMITONE_GAP = 3

export type NoteDisplay = 'english' | 'solfege' | 'number'

const NOTE_TO_SOLFEGE: Record<string, string> = {
  C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si'
}
const NOTE_TO_NUMBER: Record<string, string> = {
  C: '1', D: '2', E: '3', F: '4', G: '5', A: '6', B: '7'
}
const DISPLAY_SHOW_OCTAVE: Record<NoteDisplay, boolean> = {
  english: true,
  solfege: false,
  number: false,
}

function formatNoteLabel(noteName: string, display: NoteDisplay): string {
  if (display === 'english') return noteName
  const match = noteName.match(/^([A-G])(#?)(\d+)$/)
  if (!match) return noteName
  const [, letter, , octave] = match
  const noteMap = display === 'solfege' ? NOTE_TO_SOLFEGE : NOTE_TO_NUMBER
  const base = noteMap[letter] ?? noteName
  return DISPLAY_SHOW_OCTAVE[display] ? base + octave : base
}

function formatTimeLabel(s: number): string {
  if (s >= 60) return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  return `${s}`
}

export interface PitchCanvasProps {
  data: PitchDataPoint[]
  startTime: number
  endTime: number
  minMidi: number
  maxMidi: number
  width: number
  svgHeight: number
  leftDisplay?: NoteDisplay
  rightDisplay?: NoteDisplay
  showBothYAxes?: boolean
  currentTimeLine?: number
}

export const PitchCanvas = memo(function PitchCanvas({
  data,
  startTime,
  endTime,
  minMidi,
  maxMidi,
  width,
  svgHeight,
  leftDisplay = 'english',
  rightDisplay = 'english',
  showBothYAxes = true,
  currentTimeLine,
}: PitchCanvasProps) {
  const { colors } = useTheme()
  const duration = endTime - startTime
  const midiRange = maxMidi - minMidi
  const chartWidth = width - PADDING.left - PADDING.right

  const getMidiY = (midi: number) => {
    const normalized = (midi - minMidi) / midiRange
    return PADDING.top + (1 - normalized) * (svgHeight - PADDING.top - PADDING.bottom)
  }

  const timeToX = (time: number) =>
    PADDING.left + ((time - startTime) / duration) * chartWidth

  const freqToMidi = (freq: number) => 12 * Math.log2(freq / 440) + 69

  // Left anchor: last valid point before startTime
  let leftAnchor: PitchDataPoint | null = null
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].time < startTime && data[i].freq > 0) { leftAnchor = data[i]; break }
  }
  const inViewData = data.filter(p => p.time >= startTime && p.time <= endTime && p.freq > 0)
  const filteredData = leftAnchor ? [leftAnchor, ...inViewData] : inViewData

  // Grid data
  const yAxisLabels = []
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const noteName = midiToNoteName(midi)
    if (!noteName.includes('#')) yAxisLabels.push({ midi, note: noteName })
  }

  const allMidiLines = []
  for (let midi = minMidi; midi <= maxMidi; midi++) allMidiLines.push(midi)

  const xAxisLabels = []
  for (let t = Math.ceil(startTime); t <= startTime + duration; t++) xAxisLabels.push(t)

  // Build dots and segments
  type Dot = { x: number; y: number }
  type Segment = { points: Array<{ x: number; y: number }> }

  const dots: Dot[] = []
  const segments: Segment[] = []

  if (filteredData.length > 0) {
    let currentSegment: Array<{ x: number; y: number }> | null = null
    let prevValidMidi: number | null = null

    for (let i = 0; i < filteredData.length; i++) {
      const p = filteredData[i]
      const midi = freqToMidi(p.freq)
      if (midi < minMidi || midi > maxMidi) continue

      const x = timeToX(p.time)
      const y = getMidiY(midi)

      if (prevValidMidi === null) {
        currentSegment = [{ x, y }]
      } else {
        const timeDiff = p.time - filteredData[i - 1].time
        const midiDiff = Math.abs(midi - prevValidMidi)
        const connected = timeDiff < LINE_TIME_GAP && midiDiff < LINE_SEMITONE_GAP

        if (connected) {
          currentSegment!.push({ x, y })
        } else {
          if (currentSegment && currentSegment.length >= 2) segments.push({ points: currentSegment })
          else if (currentSegment) dots.push(...currentSegment)
          currentSegment = [{ x, y }]
        }
      }

      prevValidMidi = midi
    }

    if (currentSegment && currentSegment.length >= 2) segments.push({ points: currentSegment })
    else if (currentSegment) dots.push(...currentSegment)
  }

  const segmentPaths = segments.map(seg => {
    const pts = seg.points
    if (pts.length < 2) return `M ${pts[0].x} ${pts[0].y}`
    let d = `M ${pts[0].x} ${pts[0].y}`
    const n = pts.length
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(i + 2, n - 1)]
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`
    }
    return d
  })

  return (
    <>
      <Svg width={width} height={svgHeight}>
        <Defs>
          <LinearGradient id="pitchGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#99C5FF" stopOpacity="1" />
            <Stop offset="15%" stopColor="#007AFF" stopOpacity="1" />
            <Stop offset="85%" stopColor="#007AFF" stopOpacity="1" />
            <Stop offset="100%" stopColor="#99C5FF" stopOpacity="1" />
          </LinearGradient>
          <ClipPath id="chartClip">
            <Rect x={PADDING.left - 2} y={0} width={chartWidth + 4} height={svgHeight} />
          </ClipPath>
        </Defs>
        <Rect x={0} y={PADDING.top} width={width} height={svgHeight - PADDING.top - PADDING.bottom} fill={colors.chartBackground} />
        {xAxisLabels.map(t => (
          <Line key={`vg-${t}`}
            x1={timeToX(t)} y1={PADDING.top}
            x2={timeToX(t)} y2={svgHeight - PADDING.bottom}
            stroke={colors.chartGrid} strokeWidth={1} />
        ))}

        {allMidiLines.map(midi => (
          <Line key={`hg-${midi}`}
            x1={PADDING.left} y1={getMidiY(midi)}
            x2={width - PADDING.right} y2={getMidiY(midi)}
            stroke={colors.chartGrid} strokeWidth={1} />
        ))}

        {yAxisLabels.map(label => (
          <SvgText key={`yl-${label.note}`}
            x={PADDING.left + 4} y={getMidiY(label.midi) + 4}
            fontSize={10} fill={colors.chartLabel} textAnchor="start">
            {formatNoteLabel(label.note, leftDisplay)}
          </SvgText>
        ))}

        {showBothYAxes && yAxisLabels.map(label => (
          <SvgText key={`yr-${label.note}`}
            x={width - PADDING.right - 4} y={getMidiY(label.midi) + 4}
            fontSize={10} fill={colors.chartLabel} textAnchor="end">
            {formatNoteLabel(label.note, rightDisplay)}
          </SvgText>
        ))}

        <G clipPath="url(#chartClip)">
          {dots.map((d, i) => (
            <Circle key={`dot-${i}`} cx={d.x} cy={d.y} r={1.5} fill="rgba(0,122,255,0.5)" />
          ))}

          {segmentPaths.map((path, i) => (
            <Path key={`seg-${i}`}
              d={path} fill="none" stroke="url(#pitchGradient)" strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {currentTimeLine !== undefined
            && currentTimeLine >= startTime
            && currentTimeLine <= endTime && (
            <Line
              x1={timeToX(currentTimeLine)} y1={PADDING.top}
              x2={timeToX(currentTimeLine)} y2={svgHeight - PADDING.bottom}
              stroke="#FF3B30" strokeWidth={2} opacity={0.85}
            />
          )}
        </G>
      </Svg>

    </>
  )
})

interface PitchXAxisProps {
  startTime: number
  endTime: number
  width: number
}

export function PitchXAxis({ startTime, endTime, width }: PitchXAxisProps) {
  const { colors } = useTheme()
  const duration = endTime - startTime
  const chartWidth = width - PADDING.left - PADDING.right
  const timeToX = (t: number) => PADDING.left + ((t - startTime) / duration) * chartWidth

  const labels = []
  for (let t = Math.ceil(startTime); t <= endTime; t++) labels.push(t)
  return (
    <View style={[styles.xAxisContainer, { width, backgroundColor: colors.chartBackground, borderTopColor: colors.border }]}>
      {labels.map(t => (
        <Text
          key={t}
          style={{
            position: 'absolute',
            left: timeToX(t) - 10,
            top: 6,
            width: 20,
            fontSize: 10,
            color: colors.textSecondary,
            textAlign: 'center',
          }}
        >
          {formatTimeLabel(t)}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  xAxisContainer: {
    height: X_AXIS_HEIGHT,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
})
