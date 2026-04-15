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

const freqToMidi = (freq: number) => 12 * Math.log2(freq / 440) + 69

// 二分查找：找到第一个 data[i].time >= target 的位置
function bisectLeft(data: PitchDataPoint[], target: number): number {
  let lo = 0, hi = data.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (data[mid].time < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

// 二分查找：找到第一个 data[i].time > target 的位置
function bisectRight(data: PitchDataPoint[], target: number): number {
  let lo = 0, hi = data.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (data[mid].time <= target) lo = mid + 1
    else hi = mid
  }
  return lo
}

type Point = { x: number; y: number }

function catmullRomPath(pts: Point[]): string {
  const n = pts.length
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)]
    const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`
  }
  return d
}

function buildCurvePaths(
  data: PitchDataPoint[],
  minMidi: number,
  maxMidi: number,
  timeToX: (t: number) => number,
  getMidiY: (m: number) => number,
): { paths: string[]; dots: Point[] } {
  const paths: string[] = []
  const dots: Point[] = []
  let curSeg: Point[] | null = null
  let prevValid: { midi: number; time: number } | null = null

  for (const p of data) {
    const midi = freqToMidi(p.freq)
    if (midi < minMidi || midi > maxMidi) {
      if (curSeg) {
        if (curSeg.length >= 2) paths.push(catmullRomPath(curSeg))
        else dots.push(...curSeg)
        curSeg = null
      }
      prevValid = null
      continue
    }
    const pt: Point = { x: timeToX(p.time), y: getMidiY(midi) }
    if (prevValid === null) {
      curSeg = [pt]
    } else {
      const connected = p.time - prevValid.time < LINE_TIME_GAP && Math.abs(midi - prevValid.midi) < LINE_SEMITONE_GAP
      if (connected) {
        curSeg!.push(pt)
      } else {
        if (curSeg && curSeg.length >= 2) paths.push(catmullRomPath(curSeg))
        else if (curSeg) dots.push(...curSeg)
        curSeg = [pt]
      }
    }
    prevValid = { midi, time: p.time }
  }
  if (curSeg) {
    if (curSeg.length >= 2) paths.push(catmullRomPath(curSeg))
    else dots.push(...curSeg)
  }
  return { paths, dots }
}

export interface PitchCanvasProps {
  data: PitchDataPoint[]
  templateData?: PitchDataPoint[]
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
  templateData,
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

  // 左右各扩一个 LINE_TIME_GAP 的缓冲，确保跨越视口边界的线段不被截断
  // 视觉裁切由 SVG clipPath 处理；二分查找 O(log n) 避免遍历整个数组
  const lo = bisectLeft(data, startTime - LINE_TIME_GAP)
  const hi = bisectRight(data, endTime + LINE_TIME_GAP)
  const filteredData = data.slice(lo, hi).filter(p => p.freq > 0)
  const { paths: segmentPaths, dots } = buildCurvePaths(filteredData, minMidi, maxMidi, timeToX, getMidiY)

  let templateSegmentPaths: string[] = []
  if (templateData && templateData.length > 0) {
    const tlo = bisectLeft(templateData, startTime - LINE_TIME_GAP)
    const thi = bisectRight(templateData, endTime + LINE_TIME_GAP)
    const tmplInView = templateData.slice(tlo, thi).filter(p => p.freq > 0)
    templateSegmentPaths = buildCurvePaths(tmplInView, minMidi, maxMidi, timeToX, getMidiY).paths
  }

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
          {templateSegmentPaths.map((path, i) => (
            <Path key={`tmpl-${i}`}
              d={path} fill="none" stroke="#FF9500" strokeWidth={2.5} opacity={0.4}
              strokeLinecap="round" strokeLinejoin="round" />
          ))}

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
