import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { View, StyleSheet, useWindowDimensions, PanResponder, ScrollView } from 'react-native'
import { PitchDataPoint } from '../types'
import { noteNameToMidi } from '../utils/noteUtils'
import { CONFIG } from '../config/constants'
import { PitchCanvas, PitchXAxis, X_AXIS_HEIGHT, PADDING, pixelsPerSemitone, NoteDisplay } from './PitchCanvas'
import { useTheme } from '../context/ThemeContext'

export type { NoteDisplay }

interface PitchChartProps {
  data: PitchDataPoint[]
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
}

export function PitchChart({
  data,
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
}: PitchChartProps) {
  const { colors } = useTheme()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const [initialScrollDone, setInitialScrollDone] = useState(false)
  const [timeOffset, setTimeOffset] = useState(0)

  const scrollViewRef = useRef<ScrollView>(null)
  const actualScrollY = useRef(0)

  // Refs 避免 PanResponder stale closure
  const timeOffsetRef = useRef(0)
  const pausedRef = useRef(paused)
  const seekableRef = useRef(seekable)
  const windowWidthRef = useRef(windowWidth)
  const durationRef = useRef(duration)
  const dataLatestTimeRef = useRef(0)
  const currentTimeRef = useRef(currentTime)
  const onSeekChangeRef = useRef(onSeekChange)
  const panStartTimeOffset = useRef(0)
  const panStartScrollY = useRef(0)
  const directionLock = useRef<'horizontal' | 'vertical' | null>(null)

  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { seekableRef.current = seekable }, [seekable])
  useEffect(() => { windowWidthRef.current = windowWidth }, [windowWidth])
  useEffect(() => { durationRef.current = duration }, [duration])
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { onSeekChangeRef.current = onSeekChange }, [onSeekChange])

  const updateTimeOffset = (v: number) => { timeOffsetRef.current = v; setTimeOffset(v) }

  // 数据加载时（seekable 场景）：定位视口到数据末尾
  useEffect(() => {
    const latest = data.length > 0 ? data[data.length - 1].time : 0
    dataLatestTimeRef.current = latest
    if (seekable && paused && (currentTime === 0 || currentTime == null)) {
      updateTimeOffset(Math.max(0, latest - duration))
    }
  }, [data])

  const scrollTo = (y: number) => {
    scrollViewRef.current?.scrollTo({ y, animated: false })
  }

  // paused 状态切换时更新视口
  // 用 useLayoutEffect 在绘制前同步修正 timeOffset，避免闪烁
  useLayoutEffect(() => {
    if (!paused) {
      // 恢复播放：视口跟随 currentTime，重置 offset
      updateTimeOffset(0)
    } else if (seekableRef.current) {
      // 暂停：把视口锁定在当前播放位置，防止跳到末尾
      const currentNow = Math.max(durationRef.current, currentTimeRef.current ?? 0)
      updateTimeOffset(Math.max(0, dataLatestTimeRef.current - currentNow))
    }
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

  // 时间窗口计算
  // - seekable + paused：由 timeOffset 控制（用户拖拽）
  // - seekable + playing（历史播放）：只跟 currentTime，避免横轴一开始就跳到数据末尾
  // - 非 seekable（录音中）：跟随 max(currentTime, dataLatestTime)，保证新数据始终可见
  const dataLatestTime = data.length > 0 ? data[data.length - 1].time : 0
  const now = (seekable && paused)
    ? Math.max(duration, dataLatestTime - timeOffset)
    : seekable
      ? Math.max(duration, currentTime ?? 0)
      : Math.max(duration, Math.max(currentTime ?? 0, dataLatestTime))
  const startTime = Math.max(0, now - duration)
  const endTime = now

  // PanResponder：竖向始终可用；横向仅 seekable=true 且 paused=true 时生效
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStartTimeOffset.current = timeOffsetRef.current
        panStartScrollY.current = actualScrollY.current
        directionLock.current = null
      },
      onPanResponderMove: (_, { dx, dy }) => {
        if (!directionLock.current) {
          if (Math.abs(dx) > Math.abs(dy)) directionLock.current = 'horizontal'
          else directionLock.current = 'vertical'
        }
        if (directionLock.current === 'horizontal' && seekableRef.current && pausedRef.current) {
          const secsPerPixel = durationRef.current / (windowWidthRef.current - 20)
          const newOffset = panStartTimeOffset.current + dx * secsPerPixel
          const maxOffset = Math.max(0, dataLatestTimeRef.current - durationRef.current)
          const clampedOffset = Math.max(0, Math.min(newOffset, maxOffset))
          updateTimeOffset(clampedOffset)
          const newNow = Math.max(durationRef.current, dataLatestTimeRef.current - clampedOffset)
          const newStartTime = Math.max(0, newNow - durationRef.current)
          onSeekChangeRef.current?.(newStartTime)
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
          startTime={startTime}
          endTime={endTime}
          minMidi={minMidi}
          maxMidi={maxMidi}
          width={windowWidth}
          svgHeight={svgHeight}
          leftDisplay={leftDisplay}
          rightDisplay={rightDisplay}
          showBothYAxes={showBothYAxes}
          currentTimeLine={currentTime}
        />
      </ScrollView>

      <PitchXAxis startTime={startTime} endTime={endTime} width={windowWidth} />

      {/* 透明 overlay，拦截所有触摸（SVG 新架构会拦截触摸） */}
      <View
        testID="pitch-chart-overlay"
        style={[StyleSheet.absoluteFillObject, { bottom: X_AXIS_HEIGHT }]}
        {...panResponder.panHandlers}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f5f5f5' },
})
