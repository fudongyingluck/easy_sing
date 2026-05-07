import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { View, StyleSheet, useWindowDimensions, PanResponder, ScrollView } from 'react-native'
import { PitchDataPoint } from '../types'
import { noteNameToMidi } from '../utils/noteUtils'
import { computeViewport } from '../utils/viewportUtils'
import { CONFIG } from '../config/constants'
import { PitchCanvas, PitchXAxis, X_AXIS_HEIGHT, PADDING, pixelsPerSemitone, NoteDisplay } from './PitchCanvas'
import { useTheme } from '../context/ThemeContext'

export type { NoteDisplay }


interface PitchChartProps {
  data: PitchDataPoint[]
  templateData?: PitchDataPoint[]
  minNote: string
  maxNote: string
  duration?: number
  height?: number
  currentTime?: number
  paused?: boolean
  /** 允许横向拖拽 seek（录音 playing 时传 false，paused 时传 true；播放历史始终传 true） */
  seekable?: boolean
  /** 用户横向拖动时持续上报当前视口 startTime */
  onSeekChange?: (time: number) => void
  leftDisplay?: NoteDisplay
  rightDisplay?: NoteDisplay
  showBothYAxes?: boolean
  /** 录音时长上限（秒），用于实现阶段三：视口到头后红线向右移到边缘。0 表示无上限 */
  totalDuration?: number
}

export function PitchChart({
  data,
  templateData,
  minNote,
  maxNote,
  duration = CONFIG.DEFAULT_CHART_DURATION,
  height,
  currentTime,
  paused,
  seekable = false,
  onSeekChange,
  leftDisplay = 'english',
  rightDisplay = 'english',
  showBothYAxes = true,
  totalDuration = 0,
}: PitchChartProps) {
  const { colors } = useTheme()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const [initialScrollDone, setInitialScrollDone] = useState(false)

  // seekTime：暂停后的时间锚点（对应红线位置），初始值 = currentTime
  const [seekTime, setSeekTime] = useState(() => currentTime ?? 0)

  const scrollViewRef = useRef<ScrollView>(null)
  const actualScrollY = useRef(0)

  // Refs 避免 PanResponder stale closure
  const seekTimeRef = useRef(seekTime)
  const pausedRef = useRef(paused)
  const seekableRef = useRef(seekable)
  const windowWidthRef = useRef(windowWidth)
  const durationRef = useRef(duration)
  const currentTimeRef = useRef(currentTime)
  const onSeekChangeRef = useRef(onSeekChange)
  const totalDurationRef = useRef(totalDuration)
  const panStartSeekTime = useRef(0)
  const panStartScrollY = useRef(0)
  const directionLock = useRef<'horizontal' | 'vertical' | null>(null)

  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { seekableRef.current = seekable }, [seekable])
  useEffect(() => { windowWidthRef.current = windowWidth }, [windowWidth])
  useEffect(() => { durationRef.current = duration }, [duration])
  useLayoutEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { onSeekChangeRef.current = onSeekChange }, [onSeekChange])
  useEffect(() => { totalDurationRef.current = totalDuration }, [totalDuration])

  const updateSeekTime = (v: number) => { seekTimeRef.current = v; setSeekTime(v) }

  const scrollTo = (y: number) => {
    scrollViewRef.current?.scrollTo({ y, animated: false })
  }

  // paused 状态切换时更新视口，使红线保持居中
  // paused 从 false→true 时，将 seekTime 同步为 currentTime，
  // 使暂停瞬间视口无跳变，且后续拖动从正确锚点出发
  useLayoutEffect(() => {
    updateSeekTime(currentTimeRef.current ?? 0)
  }, [paused])

  const minMidi = noteNameToMidi(minNote)
  const maxMidi = noteNameToMidi(maxNote)
  const midiRange = maxMidi - minMidi

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

  // 时间窗口计算（三段式，录制和拖动共用同一套逻辑）
  // anchor = seekTime（暂停拖动）或 currentTime（其他情况）
  // 钳位到 [0, totalDuration]：防止定时器/拖动超出上限导致红线越界消失
  const rawAnchor = (seekable && paused) ? seekTime : (currentTime ?? 0)
  const anchor = (totalDuration > 0 && rawAnchor > totalDuration) ? totalDuration : rawAnchor
  const { startTime, endTime, currentTimeLine: anchorTimeLine } = computeViewport(anchor, duration, totalDuration)

  // PanResponder：竖向始终可用；横向仅 seekable=true 且 paused=true 时生效
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStartSeekTime.current = seekTimeRef.current
        panStartScrollY.current = actualScrollY.current
        directionLock.current = null
      },
      onPanResponderMove: (_, { dx, dy }) => {
        if (!directionLock.current) {
          if (Math.abs(dx) > Math.abs(dy)) directionLock.current = 'horizontal'
          else directionLock.current = 'vertical'
        }
        if (directionLock.current === 'horizontal' && seekableRef.current && pausedRef.current && Math.abs(dx) > 8) {
          const secsPerPixel = durationRef.current / (windowWidthRef.current - 20)
          // 向右拖（dx > 0）= 往历史看 = seekTime 减小
          const newSeekTime = panStartSeekTime.current - dx * secsPerPixel
          const minSeekTime = 0  // seekTime 最小为 0（anchor 可以到 0，Phase1 视口会钉在起点）
          const maxSeekTime = totalDurationRef.current > 0 ? totalDurationRef.current : (currentTimeRef.current ?? 0)
          const clamped = Math.max(minSeekTime, Math.min(newSeekTime, maxSeekTime))
          updateSeekTime(clamped)
          onSeekChangeRef.current?.(clamped)  // 上报 seekTime（红线位置），不是 startTime
        } else if (directionLock.current === 'vertical') {
          scrollTo(panStartScrollY.current - dy)
        }
      },
    })
  ).current

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
          templateData={templateData}
          startTime={startTime}
          endTime={endTime}
          minMidi={minMidi}
          maxMidi={maxMidi}
          width={windowWidth}
          svgHeight={svgHeight}
          leftDisplay={leftDisplay}
          rightDisplay={rightDisplay}
          showBothYAxes={showBothYAxes}
          currentTimeLine={currentTime !== undefined ? anchorTimeLine : undefined}
        />
      </ScrollView>

      <PitchXAxis startTime={startTime} endTime={endTime} width={windowWidth} />

      {/* 透明 overlay，拦截所有触摸（SVG 新架构会拦截触摸） */}
      <View
        testID="pitch-chart-overlay"
        style={[StyleSheet.absoluteFillObject, { bottom: X_AXIS_HEIGHT }]}
        {...panResponder?.panHandlers}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f5f5f5' },
})
