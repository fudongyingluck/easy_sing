import React, { useState, useRef, useEffect } from 'react'
import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native'
import Svg, { Line, Text as SvgText, Path } from 'react-native-svg'
import { PitchDataPoint } from '../types'
import { noteNameToMidi, midiToNoteName } from '../utils/noteUtils'
import { CONFIG } from '../config/constants'

const PADDING = { top: 10, bottom: 30, left: 5, right: 10 }
const X_AXIS_HEIGHT = 30 // 横坐标区域高度
const pixelsPerSemitone = 20 // 每个半音20像素

interface PitchChartProps {
  data: PitchDataPoint[]
  minNote: string
  maxNote: string
  duration?: number // 显示最近多少秒
  height?: number // 固定高度
  currentTime?: number // 当前录音时刻（秒），用于推移横坐标
}

export function PitchChart({ data, minNote, maxNote, duration = CONFIG.DEFAULT_CHART_DURATION, height, currentTime }: PitchChartProps) {
  const scrollViewRef = useRef<ScrollView>(null)
  const [initialScrollDone, setInitialScrollDone] = useState(false)
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()

  // 计算MIDI范围
  const minMidi = noteNameToMidi(minNote)
  const maxMidi = noteNameToMidi(maxNote)
  const midiRange = maxMidi - minMidi

  // 计算图表尺寸
  const chartWidth = windowWidth - PADDING.left - PADDING.right
  const svgHeight = midiRange * pixelsPerSemitone + PADDING.top + PADDING.bottom
  const chartHeight = height || (windowHeight * 5 / 12)
  const scrollContentHeight = Math.max(chartHeight - X_AXIS_HEIGHT, svgHeight)
  const visibleHeight = chartHeight - X_AXIS_HEIGHT

  // 坐标转换
  const getMidiY = (midi: number) => {
    const normalized = (midi - minMidi) / midiRange
    return PADDING.top + (1 - normalized) * (svgHeight - PADDING.top - PADDING.bottom)
  }

  const midiToY = getMidiY

  // 初始滚动到音域的中间位置
  useEffect(() => {
    if (!initialScrollDone && scrollViewRef.current && scrollContentHeight > visibleHeight) {
      setTimeout(() => {
        // 计算中间位置
        const centerMidi = minMidi + midiRange / 2
        const centerY = getMidiY(centerMidi)
        const scrollY = Math.max(0, centerY - visibleHeight / 2)
        scrollViewRef.current?.scrollTo({ y: scrollY, animated: false })
        setInitialScrollDone(true)
      }, 50)
    }
  }, [minMidi, maxMidi, initialScrollDone, scrollContentHeight, visibleHeight])

  // 使用 currentTime（实时推移）或最后数据点时间
  const now = currentTime ?? (data.length > 0 ? data[data.length - 1].time : 0)
  const startTime = Math.max(0, now - duration)
  const filteredData = data.filter(p => p.time >= startTime)

  // 坐标转换
  const timeToX = (time: number) => {
    const relativeTime = time - startTime
    return PADDING.left + (relativeTime / duration) * chartWidth
  }

  // 生成Y轴标签（音符）- 放在内侧（只标白键）
  const yAxisLabels = []
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const noteName = midiToNoteName(midi)
    if (!noteName.includes('#')) { // 只标白键
      yAxisLabels.push({ midi, note: noteName })
    }
  }

  // 生成所有半音的横线（包括黑键）
  const allMidiLines = []
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    allMidiLines.push(midi)
  }

  // 格式化时间显示
  const formatTimeLabel = (seconds: number): string => {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    return `${seconds}`
  }

  // 生成X轴标签（时间）- 只生成可视范围内的整数秒
  const xAxisLabels = []
  for (let t = Math.ceil(startTime); t <= startTime + duration; t += 1) {
    xAxisLabels.push(t)
  }

  // 生成路径数据
  const pathData = []
  for (let i = 0; i < filteredData.length; i++) {
    const point = filteredData[i]
    if (point.freq > 0) {
      const midi = Math.round(12 * Math.log2(point.freq / 440) + 69)
      if (midi >= minMidi && midi <= maxMidi) {
        const x = timeToX(point.time)
        const y = midiToY(midi)
        pathData.push({ x, y })
      }
    }
  }

  // 生成路径字符串，时间间隔超过 0.3s 则断开（沉默段不连线）
  const GAP_THRESHOLD = 0.3
  const path = pathData.length > 1
    ? pathData.map((p, i) => {
        if (i === 0) return `M ${p.x} ${p.y}`
        const timeDiff = filteredData[i]?.time - filteredData[i - 1]?.time
        const cmd = (timeDiff > GAP_THRESHOLD) ? 'M' : 'L'
        return `${cmd} ${p.x} ${p.y}`
      }).join(' ')
    : ''

  // 是否需要滚动
  const needsScroll = svgHeight > visibleHeight

  return (
    <View style={[styles.container, { height: chartHeight, width: windowWidth }]}>
      {/* 可滚动的图表区域 */}
      <ScrollView
        ref={scrollViewRef}
        vertical
        showsVerticalScrollIndicator={needsScroll}
        style={[styles.scrollView, { height: visibleHeight, width: windowWidth }]}
        contentContainerStyle={[
          styles.scrollContent,
          { height: scrollContentHeight, paddingBottom: PADDING.bottom }
        ]}
      >
        <Svg width={windowWidth} height={svgHeight}>
          {/* 竖格子线 - 每秒一条（整数秒） */}
          {xAxisLabels.map((t) => (
            <Line
              key={`vgrid-${t}`}
              x1={timeToX(t)}
              y1={PADDING.top}
              x2={timeToX(t)}
              y2={svgHeight - PADDING.bottom}
              stroke="#ddd"
              strokeWidth={1}
            />
          ))}

          {/* 横格子线 - 所有半音都画线 */}
          {allMidiLines.map((midi) => (
            <Line
              key={`hgrid-${midi}`}
              x1={PADDING.left}
              y1={midiToY(midi)}
              x2={windowWidth - PADDING.right}
              y2={midiToY(midi)}
              stroke="#ddd"
              strokeWidth={1}
            />
          ))}

          {/* Y轴标签 - 放在内侧 */}
          {yAxisLabels.map((label) => (
            <SvgText
              key={label.note}
              x={PADDING.left + 4}
              y={midiToY(label.midi) + 4}
              fontSize={10}
              fill="#666"
              textAnchor="start"
            >
              {label.note}
            </SvgText>
          ))}

          {/* 音高曲线 */}
          {pathData.length > 1 && (
            <Path
              d={path}
              fill="none"
              stroke="#007AFF"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </Svg>
      </ScrollView>

      {/* 固定在底部的横坐标 */}
      <View style={[styles.xAxisContainer, { width: windowWidth }]}>
        <Svg width={windowWidth} height={X_AXIS_HEIGHT}>
          {/* X轴标签（时间）- 显示绝对时间，格式为整数或 xx:xx */}
          {xAxisLabels.map((t) => (
            <SvgText
              key={t}
              x={timeToX(t)}
              y={16}
              fontSize={10}
              fill="#666"
              textAnchor="middle"
            >
              {formatTimeLabel(t)}
            </SvgText>
          ))}
        </Svg>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff'
  },
  scrollView: {},
  scrollContent: {
    paddingBottom: 0
  },
  xAxisContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: X_AXIS_HEIGHT,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee'
  }
})
