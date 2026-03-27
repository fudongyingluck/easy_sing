import React, { useState, useRef, useEffect } from 'react'
import { View, StyleSheet, useWindowDimensions, PanResponder, ScrollView } from 'react-native'
import Svg, { Line, Text as SvgText, Path, Circle, Rect, Defs, LinearGradient, Stop, ClipPath, G } from 'react-native-svg'
import { PitchDataPoint } from '../types'
import { noteNameToMidi, midiToNoteName } from '../utils/noteUtils'
import { CONFIG } from '../config/constants'

const PADDING = { top: 4, bottom: 4, left: 5, right: 10 }
const X_AXIS_HEIGHT = 30
const pixelsPerSemitone = 20

const LINE_TIME_GAP = 0.25
const LINE_SEMITONE_GAP = 3

type NoteDisplay = 'english' | 'solfege' | 'number'

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

interface PitchChartProps {
  data: PitchDataPoint[]
  minNote: string
  maxNote: string
  duration?: number
  height?: number
  currentTime?: number
  paused?: boolean
  leftDisplay?: NoteDisplay
  rightDisplay?: NoteDisplay
}

export function PitchChart({ data, minNote, maxNote, duration = CONFIG.DEFAULT_CHART_DURATION, height, currentTime, paused, leftDisplay = 'english', rightDisplay = 'english' }: PitchChartProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const [initialScrollDone, setInitialScrollDone] = useState(false)
  const [timeOffset, setTimeOffset] = useState(0)

  const scrollViewRef = useRef<ScrollView>(null)
  const actualScrollY = useRef(0)  // 只由 onScroll 回调更新，始终反映 ScrollView 真实位置

  // refs 避免 PanResponder stale closure
  const timeOffsetRef = useRef(0)
  const pausedRef = useRef(paused)
  const currentTimeRef = useRef(currentTime)
  const windowWidthRef = useRef(windowWidth)
  const durationRef = useRef(duration)
  const panStartTimeOffset = useRef(0)
  const panStartScrollY = useRef(0)
  const directionLock = useRef<'horizontal' | 'vertical' | null>(null)

  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { windowWidthRef.current = windowWidth }, [windowWidth])
  useEffect(() => { durationRef.current = duration }, [duration])

  const updateTimeOffset = (v: number) => { timeOffsetRef.current = v; setTimeOffset(v) }

  const scrollTo = (y: number) => {
    scrollViewRef.current?.scrollTo({ y, animated: false })
    // 不在这里更新 actualScrollY，onScroll 是唯一来源，确保始终是真实值
  }

  // 录音继续时重置时间视口
  useEffect(() => {
    if (!paused) updateTimeOffset(0)
  }, [paused])

  // PanResponder 拦截所有手势（SVG 会拦截触摸，必须用 overlay）
  // 垂直方向调用 scrollTo，由 ScrollView 原生 clamp 边界
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStartTimeOffset.current = timeOffsetRef.current
        panStartScrollY.current = actualScrollY.current  // 用真实位置，不受乐观更新污染
        directionLock.current = null
      },
      onPanResponderMove: (_, { dx, dy }) => {
        if (!directionLock.current) {
          if (Math.abs(dx) > Math.abs(dy)) directionLock.current = 'horizontal'
          else directionLock.current = 'vertical'
        }
        if (directionLock.current === 'horizontal' && pausedRef.current) {
          const secsPerPixel = durationRef.current / (windowWidthRef.current - 20)
          const newOffset = panStartTimeOffset.current + dx * secsPerPixel
          const maxOffset = Math.max(0, (currentTimeRef.current ?? 0) - durationRef.current)
          updateTimeOffset(Math.max(0, Math.min(newOffset, maxOffset)))
        } else if (directionLock.current === 'vertical') {
          // scrollTo 内部会 clamp 到 [0, maxScrollY]，无需手动限制
          scrollTo(panStartScrollY.current - dy)
        }
      },
    })
  ).current

  const minMidi = noteNameToMidi(minNote)
  const maxMidi = noteNameToMidi(maxNote)
  const midiRange = maxMidi - minMidi

  const chartWidth = windowWidth - PADDING.left - PADDING.right
  const svgHeight = midiRange * pixelsPerSemitone + PADDING.top + PADDING.bottom
  const chartHeight = height || (windowHeight * 5 / 12)
  const visibleHeight = chartHeight - X_AXIS_HEIGHT

  const getMidiY = (midi: number) => {
    const normalized = (midi - minMidi) / midiRange
    return PADDING.top + (1 - normalized) * (svgHeight - PADDING.top - PADDING.bottom)
  }

  // 初始居中
  useEffect(() => {
    if (!initialScrollDone && svgHeight > visibleHeight) {
      const centerMidi = minMidi + midiRange / 2
      const centerY = getMidiY(centerMidi)
      const initY = Math.max(0, centerY - visibleHeight / 2)
      scrollTo(initY)
      setInitialScrollDone(true)
    }
  }, [minMidi, maxMidi, initialScrollDone, svgHeight, visibleHeight])

  const dataLatestTime = data.length > 0 ? data[data.length - 1].time : 0
  const latestTime = Math.max(currentTime ?? 0, dataLatestTime)
  const now = Math.max(duration, latestTime - timeOffset)
  const startTime = Math.max(0, now - duration)
  // 找到 startTime 之前最近的一个有效点作为左侧锚点，防止线段在靠近左边缘时因点数不足而消失
  let leftAnchor: PitchDataPoint | null = null
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].time < startTime && data[i].freq > 0) { leftAnchor = data[i]; break }
  }
  const inViewData = data.filter(p => p.time >= startTime && p.time <= now && p.freq > 0)
  const filteredData = leftAnchor ? [leftAnchor, ...inViewData] : inViewData

  const timeToX = (time: number) =>
    PADDING.left + ((time - startTime) / duration) * chartWidth

  const freqToMidi = (freq: number) => 12 * Math.log2(freq / 440) + 69

  const yAxisLabels = []
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const noteName = midiToNoteName(midi)
    if (!noteName.includes('#')) yAxisLabels.push({ midi, note: noteName })
  }

  const allMidiLines = []
  for (let midi = minMidi; midi <= maxMidi; midi++) allMidiLines.push(midi)

  const xAxisLabels = []
  for (let t = Math.ceil(startTime); t <= startTime + duration; t++) xAxisLabels.push(t)

  const formatTimeLabel = (s: number) => {
    if (s >= 60) return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
    return `${s}`
  }

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
    <View style={[styles.container, { height: chartHeight, width: windowWidth }]}>
      {/* ScrollView 负责实际渲染位置，scrollEnabled=false 由 PanResponder 驱动 */}
      <ScrollView
        ref={scrollViewRef}
        style={{ height: visibleHeight }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        onScroll={e => { actualScrollY.current = e.nativeEvent.contentOffset.y }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <Svg width={windowWidth} height={svgHeight}>
          <Defs>
            <LinearGradient id="pitchGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#99C5FF" stopOpacity="1" />
              <Stop offset="15%" stopColor="#007AFF" stopOpacity="1" />
              <Stop offset="85%" stopColor="#007AFF" stopOpacity="1" />
              <Stop offset="100%" stopColor="#99C5FF" stopOpacity="1" />
            </LinearGradient>
            <ClipPath id="chartClip">
              <Rect x={PADDING.left} y={0} width={chartWidth} height={svgHeight} />
            </ClipPath>
          </Defs>
          <Rect x={0} y={PADDING.top} width={windowWidth} height={svgHeight - PADDING.top - PADDING.bottom} fill="#f5f5f5" />
          {xAxisLabels.map(t => (
            <Line key={`vg-${t}`}
              x1={timeToX(t)} y1={PADDING.top}
              x2={timeToX(t)} y2={svgHeight - PADDING.bottom}
              stroke="#ddd" strokeWidth={1} />
          ))}

          {allMidiLines.map(midi => (
            <Line key={`hg-${midi}`}
              x1={PADDING.left} y1={getMidiY(midi)}
              x2={windowWidth - PADDING.right} y2={getMidiY(midi)}
              stroke="#ddd" strokeWidth={1} />
          ))}

          {yAxisLabels.map(label => (
            <SvgText key={`yl-${label.note}`}
              x={PADDING.left + 4} y={getMidiY(label.midi) + 4}
              fontSize={10} fill="#666" textAnchor="start">
              {formatNoteLabel(label.note, leftDisplay)}
            </SvgText>
          ))}

          {yAxisLabels.map(label => (
            <SvgText key={`yr-${label.note}`}
              x={windowWidth - PADDING.right - 4} y={getMidiY(label.midi) + 4}
              fontSize={10} fill="#666" textAnchor="end">
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
          </G>
        </Svg>
      </ScrollView>

      {/* 透明 overlay，拦截所有触摸（SVG 新架构会拦截触摸，必须用此方案） */}
      <View
        style={[StyleSheet.absoluteFillObject, { bottom: X_AXIS_HEIGHT }]}
        {...panResponder.panHandlers}
      />

      <View style={[styles.xAxisContainer, { width: windowWidth }]}>
        <Svg width={windowWidth} height={X_AXIS_HEIGHT}>
          {xAxisLabels.map(t => (
            <SvgText key={t} x={timeToX(t)} y={16} fontSize={10} fill="#666" textAnchor="middle">
              {formatTimeLabel(t)}
            </SvgText>
          ))}
        </Svg>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f5f5f5' },
  xAxisContainer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: X_AXIS_HEIGHT,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee'
  }
})
