import React, { useState, useRef, useEffect } from 'react'
import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native'
import Svg, { Line, Text as SvgText, Path, Circle } from 'react-native-svg'
import { PitchDataPoint } from '../types'
import { noteNameToMidi, midiToNoteName } from '../utils/noteUtils'
import { CONFIG } from '../config/constants'

const PADDING = { top: 10, bottom: 30, left: 5, right: 10 }
const X_AXIS_HEIGHT = 30
const pixelsPerSemitone = 20

// Two consecutive points are "connected" (draw line) if:
//   - time gap < 0.15 s  AND
//   - pitch difference < 2 semitones
const LINE_TIME_GAP = 0.15
const LINE_SEMITONE_GAP = 2

interface PitchChartProps {
  data: PitchDataPoint[]
  minNote: string
  maxNote: string
  duration?: number
  height?: number
  currentTime?: number
}

export function PitchChart({ data, minNote, maxNote, duration = CONFIG.DEFAULT_CHART_DURATION, height, currentTime }: PitchChartProps) {
  const scrollViewRef = useRef<ScrollView>(null)
  const [initialScrollDone, setInitialScrollDone] = useState(false)
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()

  const minMidi = noteNameToMidi(minNote)
  const maxMidi = noteNameToMidi(maxNote)
  const midiRange = maxMidi - minMidi

  const chartWidth = windowWidth - PADDING.left - PADDING.right
  const svgHeight = midiRange * pixelsPerSemitone + PADDING.top + PADDING.bottom
  const chartHeight = height || (windowHeight * 5 / 12)
  const scrollContentHeight = Math.max(chartHeight - X_AXIS_HEIGHT, svgHeight)
  const visibleHeight = chartHeight - X_AXIS_HEIGHT

  const getMidiY = (midi: number) => {
    const normalized = (midi - minMidi) / midiRange
    return PADDING.top + (1 - normalized) * (svgHeight - PADDING.top - PADDING.bottom)
  }

  useEffect(() => {
    if (!initialScrollDone && scrollViewRef.current && scrollContentHeight > visibleHeight) {
      setTimeout(() => {
        const centerMidi = minMidi + midiRange / 2
        const centerY = getMidiY(centerMidi)
        const scrollY = Math.max(0, centerY - visibleHeight / 2)
        scrollViewRef.current?.scrollTo({ y: scrollY, animated: false })
        setInitialScrollDone(true)
      }, 50)
    }
  }, [minMidi, maxMidi, initialScrollDone, scrollContentHeight, visibleHeight])

  const now = currentTime ?? (data.length > 0 ? data[data.length - 1].time : 0)
  const startTime = Math.max(0, now - duration)
  const filteredData = data.filter(p => p.time >= startTime && p.freq > 0)

  const timeToX = (time: number) =>
    PADDING.left + ((time - startTime) / duration) * chartWidth

  const freqToMidi = (freq: number) => 12 * Math.log2(freq / 440) + 69

  // Y-axis labels (white keys only)
  const yAxisLabels = []
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const noteName = midiToNoteName(midi)
    if (!noteName.includes('#')) yAxisLabels.push({ midi, note: noteName })
  }

  // All semitone grid lines
  const allMidiLines = []
  for (let midi = minMidi; midi <= maxMidi; midi++) allMidiLines.push(midi)

  // X-axis labels
  const xAxisLabels = []
  for (let t = Math.ceil(startTime); t <= startTime + duration; t++) xAxisLabels.push(t)

  const formatTimeLabel = (s: number) => {
    if (s >= 60) return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
    return `${s}`
  }

  // Build render primitives: classify each point as dot or part of a line segment
  // A "segment" is a run of consecutive points that are all "connected"
  type Dot = { x: number; y: number }
  type Segment = { points: Array<{ x: number; y: number }> }

  const dots: Dot[] = []
  const segments: Segment[] = []

  if (filteredData.length > 0) {
    let currentSegment: Array<{ x: number; y: number }> | null = null

    for (let i = 0; i < filteredData.length; i++) {
      const p = filteredData[i]
      const midi = freqToMidi(p.freq)
      if (midi < minMidi || midi > maxMidi) continue

      const x = timeToX(p.time)
      const y = getMidiY(midi)

      if (i === 0) {
        currentSegment = [{ x, y }]
        continue
      }

      const prev = filteredData[i - 1]
      const prevMidi = freqToMidi(prev.freq)
      const timeDiff = p.time - prev.time
      const midiDiff = Math.abs(midi - prevMidi)

      const connected = timeDiff < LINE_TIME_GAP && midiDiff < LINE_SEMITONE_GAP

      if (connected) {
        currentSegment!.push({ x, y })
      } else {
        // Flush current segment
        if (currentSegment && currentSegment.length >= 3) {
          segments.push({ points: currentSegment })
        } else if (currentSegment) {
          dots.push(...currentSegment)
        }
        currentSegment = [{ x, y }]
      }
    }

    // Flush last segment
    if (currentSegment && currentSegment.length >= 3) {
      segments.push({ points: currentSegment })
    } else if (currentSegment) {
      dots.push(...currentSegment)
    }
  }

  // Build SVG path strings for line segments
  const segmentPaths = segments.map(seg =>
    seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  )

  const needsScroll = svgHeight > visibleHeight

  return (
    <View style={[styles.container, { height: chartHeight, width: windowWidth }]}>
      <ScrollView
        ref={scrollViewRef}
        vertical
        showsVerticalScrollIndicator={needsScroll}
        style={[styles.scrollView, { height: visibleHeight, width: windowWidth }]}
        contentContainerStyle={[styles.scrollContent, { height: scrollContentHeight }]}
      >
        <Svg width={windowWidth} height={svgHeight}>
          {/* Vertical grid lines */}
          {xAxisLabels.map(t => (
            <Line key={`vg-${t}`}
              x1={timeToX(t)} y1={PADDING.top}
              x2={timeToX(t)} y2={svgHeight - PADDING.bottom}
              stroke="#ddd" strokeWidth={1} />
          ))}

          {/* Horizontal semitone lines */}
          {allMidiLines.map(midi => (
            <Line key={`hg-${midi}`}
              x1={PADDING.left} y1={getMidiY(midi)}
              x2={windowWidth - PADDING.right} y2={getMidiY(midi)}
              stroke="#ddd" strokeWidth={1} />
          ))}

          {/* Y-axis note labels */}
          {yAxisLabels.map(label => (
            <SvgText key={label.note}
              x={PADDING.left + 4} y={getMidiY(label.midi) + 4}
              fontSize={10} fill="#666" textAnchor="start">
              {label.note}
            </SvgText>
          ))}

          {/* Scattered dots (isolated / unstable points) */}
          {dots.map((d, i) => (
            <Circle key={`dot-${i}`}
              cx={d.x} cy={d.y} r={1.5}
              fill="rgba(0,122,255,0.3)" />
          ))}

          {/* Connected line segments (stable pitch) */}
          {segmentPaths.map((path, i) => (
            <Path key={`seg-${i}`}
              d={path}
              fill="none"
              stroke="#007AFF"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round" />
          ))}
        </Svg>
      </ScrollView>

      {/* Fixed X-axis */}
      <View style={[styles.xAxisContainer, { width: windowWidth }]}>
        <Svg width={windowWidth} height={X_AXIS_HEIGHT}>
          {xAxisLabels.map(t => (
            <SvgText key={t}
              x={timeToX(t)} y={16}
              fontSize={10} fill="#666" textAnchor="middle">
              {formatTimeLabel(t)}
            </SvgText>
          ))}
        </Svg>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff' },
  scrollView: {},
  scrollContent: { paddingBottom: 0 },
  xAxisContainer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: X_AXIS_HEIGHT,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee'
  }
})
