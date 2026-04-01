import React, { useRef, useState, useEffect } from 'react'
import { View, StyleSheet, useWindowDimensions, PanResponder, ScrollView, Animated } from 'react-native'
import { PitchDataPoint } from '../types'
import { noteNameToMidi } from '../utils/noteUtils'
import { CONFIG } from '../config/constants'
import { PitchCanvas, PitchXAxis, X_AXIS_HEIGHT, PADDING, pixelsPerSemitone, NoteDisplay } from './PitchCanvas'
import { useTheme } from '../context/ThemeContext'

const SECONDS_PER_SCREEN = CONFIG.DEFAULT_CHART_DURATION
const BOUNCE_MARGIN = SECONDS_PER_SCREEN * 0.3

export interface PlaybackPitchChartProps {
  data: PitchDataPoint[]
  minNote: string
  maxNote: string
  totalDuration: number
  currentTime: number
  isPlaying: boolean
  height?: number
  leftDisplay?: NoteDisplay
  rightDisplay?: NoteDisplay
  showBothYAxes?: boolean
  onSeek?: (time: number) => void
}

export function PlaybackPitchChart({
  data,
  minNote,
  maxNote,
  totalDuration,
  currentTime,
  isPlaying,
  height,
  leftDisplay = 'english',
  rightDisplay = 'english',
  showBothYAxes = true,
  onSeek,
}: PlaybackPitchChartProps) {
  const { colors } = useTheme()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()

  // refs 避免 PanResponder stale closure
  const isPlayingRef = useRef(isPlaying)
  const totalDurationRef = useRef(totalDuration)
  const windowWidthRef = useRef(windowWidth)
  const currentTimeRef = useRef(currentTime)
  const onSeekRef = useRef(onSeek)
  const isDraggingCanvas = useRef(false)
  const panStartCurrentTime = useRef(0)
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { totalDurationRef.current = totalDuration }, [totalDuration])
  useEffect(() => { windowWidthRef.current = windowWidth }, [windowWidth])
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { onSeekRef.current = onSeek }, [onSeek])

  // viewport 用 Animated.Value 驱动，listener 同步到 state 供渲染使用
  const viewportAnim = useRef(new Animated.Value(0)).current
  const viewportStartRef = useRef(0)
  const [viewportStart, setViewportStart] = useState(0)

  useEffect(() => {
    const id = viewportAnim.addListener(({ value }) => {
      viewportStartRef.current = value
      setViewportStart(value)
    })
    return () => viewportAnim.removeListener(id)
  }, [])

  // 三段式 viewport 计算（不依赖 render 闭包，通过 ref 读取 totalDuration）
  const computeNaturalViewport = (t: number): number => {
    const dur = totalDurationRef.current
    const half = SECONDS_PER_SCREEN / 2
    if (dur <= SECONDS_PER_SCREEN) return 0
    if (t <= half) return 0
    if (t >= dur - half) return Math.max(0, dur - SECONDS_PER_SCREEN)
    return t - half
  }

  // 播放中：viewport 跟随 currentTime
  useEffect(() => {
    if (isPlaying) {
      viewportAnim.setValue(computeNaturalViewport(currentTime))
    }
  }, [currentTime, isPlaying])

  // 暂停时进度条 seek：viewport 立即跟随 currentTime（画布拖动时跳过，避免冲突）
  useEffect(() => {
    if (!isPlayingRef.current && !isDraggingCanvas.current) {
      viewportAnim.setValue(computeNaturalViewport(currentTime))
    }
  }, [currentTime])

  // 尺寸
  const minMidi = noteNameToMidi(minNote)
  const maxMidi = noteNameToMidi(maxNote)
  const midiRange = maxMidi - minMidi
  const svgHeight = midiRange * pixelsPerSemitone + PADDING.top + PADDING.bottom
  const chartHeight = height ?? (windowHeight * 5 / 12)
  const visibleHeight = chartHeight - X_AXIS_HEIGHT
  const chartWidth = windowWidth - PADDING.left - PADDING.right

  // 红线屏幕 x（clamp 在图表绘制区内，永不消失）
  const redLineX = Math.max(
    PADDING.left,
    Math.min(
      PADDING.left + chartWidth,
      PADDING.left + ((currentTime - viewportStart) / SECONDS_PER_SCREEN) * chartWidth,
    ),
  )

  // 竖向初始居中
  const [initialScrollDone, setInitialScrollDone] = useState(false)
  const scrollViewRef = useRef<ScrollView>(null)
  const actualScrollY = useRef(0)

  useEffect(() => {
    if (!initialScrollDone && svgHeight > visibleHeight) {
      const centerMidi = minMidi + midiRange / 2
      const normalized = (centerMidi - minMidi) / midiRange
      const centerY = PADDING.top + (1 - normalized) * (svgHeight - PADDING.top - PADDING.bottom)
      scrollViewRef.current?.scrollTo({ y: Math.max(0, centerY - visibleHeight / 2), animated: false })
      setInitialScrollDone(true)
    }
  }, [minMidi, maxMidi, initialScrollDone, svgHeight, visibleHeight])

  // PanResponder：横向 = 画布平移（仅暂停时）；竖向 = 始终可滚动
  const panStartViewport = useRef(0)
  const panStartScrollY = useRef(0)
  const directionLock = useRef<'horizontal' | 'vertical' | null>(null)

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      viewportAnim.stopAnimation()
      panStartViewport.current = viewportStartRef.current
      panStartScrollY.current = actualScrollY.current
      panStartCurrentTime.current = currentTimeRef.current
      isDraggingCanvas.current = false
      directionLock.current = null
    },
    onPanResponderMove: (_, { dx, dy }) => {
      if (!directionLock.current) {
        if (Math.abs(dx) > Math.abs(dy)) {
          directionLock.current = 'horizontal'
          isDraggingCanvas.current = true
        } else {
          directionLock.current = 'vertical'
        }
      }
      if (directionLock.current === 'horizontal') {
        if (isPlayingRef.current) return
        const cw = windowWidthRef.current - PADDING.left - PADDING.right
        const delta = -dx * SECONDS_PER_SCREEN / cw
        const raw = panStartViewport.current + delta
        const maxV = Math.max(0, totalDurationRef.current - SECONDS_PER_SCREEN)
        viewportAnim.setValue(Math.max(-BOUNCE_MARGIN, Math.min(maxV + BOUNCE_MARGIN, raw)))
      } else {
        scrollViewRef.current?.scrollTo({ y: panStartScrollY.current - dy, animated: false })
      }
    },
    onPanResponderRelease: (_, { dx }) => {
      if (directionLock.current === 'horizontal' && !isPlayingRef.current) {
        const maxV = Math.max(0, totalDurationRef.current - SECONDS_PER_SCREEN)
        const cw = windowWidthRef.current - PADDING.left - PADDING.right
        const delta = -dx * SECONDS_PER_SCREEN / cw
        // 放手后 viewport 的最终位置（clamp 到合法范围）
        const finalViewport = Math.max(0, Math.min(maxV, panStartViewport.current + delta))
        const newTime = Math.max(0, Math.min(totalDurationRef.current, panStartCurrentTime.current + (finalViewport - panStartViewport.current)))
        isDraggingCanvas.current = false
        // spring 弹回到 finalViewport，完成后 seek 到对应时间
        Animated.spring(viewportAnim, {
          toValue: finalViewport,
          useNativeDriver: false,
          tension: 120,
          friction: 8,
        }).start(() => {
          onSeekRef.current?.(newTime)
        })
      } else {
        isDraggingCanvas.current = false
      }
    },
    onPanResponderTerminate: () => {
      isDraggingCanvas.current = false
      if (!isPlayingRef.current) snapViewportBack()
    },
  })).current

  const snapViewportBack = () => {
    const minV = 0
    const maxV = Math.max(0, totalDurationRef.current - SECONDS_PER_SCREEN)
    const cur = viewportStartRef.current
    const target = Math.max(minV, Math.min(maxV, cur))
    if (Math.abs(cur - target) > 0.001) {
      Animated.spring(viewportAnim, {
        toValue: target,
        useNativeDriver: false,
        tension: 120,
        friction: 8,
      }).start()
    }
  }

  const viewportEnd = viewportStart + SECONDS_PER_SCREEN

  return (
    <View style={[styles.container, { height: chartHeight, width: windowWidth, backgroundColor: colors.chartBackground }]}>
      <ScrollView
        ref={scrollViewRef}
        style={{ height: visibleHeight }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        onScroll={e => { actualScrollY.current = e.nativeEvent.contentOffset.y }}
        scrollEventThrottle={16}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
      >
        <PitchCanvas
          data={data}
          startTime={viewportStart}
          endTime={viewportEnd}
          minMidi={minMidi}
          maxMidi={maxMidi}
          width={windowWidth}
          svgHeight={svgHeight}
          leftDisplay={leftDisplay}
          rightDisplay={rightDisplay}
          showBothYAxes={showBothYAxes}
          // currentTimeLine 不传：红线由下方 overlay 绘制（保证始终可见）
        />
      </ScrollView>

      <PitchXAxis startTime={viewportStart} endTime={viewportEnd} width={windowWidth} />

      {/* 红线 overlay：position absolute，clamp 后永远可见 */}
      <View
        pointerEvents="none"
        style={[styles.redLine, { left: redLineX - 1, bottom: X_AXIS_HEIGHT }]}
      />

      {/* 手势 overlay（覆盖画布区，不含 X 轴） */}
      <View
        style={[StyleSheet.absoluteFillObject, { bottom: X_AXIS_HEIGHT }]}
        {...panResponder.panHandlers}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {},
  redLine: {
    position: 'absolute',
    top: 0,
    width: 2,
    backgroundColor: '#FF3B30',
    opacity: 0.85,
  },
})
