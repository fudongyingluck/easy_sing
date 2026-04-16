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
}: PitchChartProps) {
  const { colors } = useTheme()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const [initialScrollDone, setInitialScrollDone] = useState(false)

  // seekTime：暂停后视口右边沿的绝对时间，至少为 duration，确保视口不从 0 开始
  const [seekTime, setSeekTime] = useState(() => Math.max(duration, currentTime ?? 0))

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
  const panStartSeekTime = useRef(0)
  const panStartScrollY = useRef(0)
  const directionLock = useRef<'horizontal' | 'vertical' | null>(null)

  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { seekableRef.current = seekable }, [seekable])
  useEffect(() => { windowWidthRef.current = windowWidth }, [windowWidth])
  useEffect(() => { durationRef.current = duration }, [duration])
  useLayoutEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { onSeekChangeRef.current = onSeekChange }, [onSeekChange])

  const updateSeekTime = (v: number) => { seekTimeRef.current = v; setSeekTime(v) }

  const scrollTo = (y: number) => {
    scrollViewRef.current?.scrollTo({ y, animated: false })
  }

  // paused 状态切换时更新视口，至少为 duration 避免视口右边沿跳到 0
  // 用 useLayoutEffect 在绘制前同步修正 seekTime，避免闪烁
  useLayoutEffect(() => {
    updateSeekTime(Math.max(durationRef.current, currentTimeRef.current ?? 0))
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
  // - seekable + paused：视口右边沿 = seekTime（用户拖拽直接改这个值）
  // - seekable + playing（历史播放）：跟随 currentTime
  // - 非 seekable（录音中）：跟随 currentTime，同时兼顾数据末尾
  const dataLatestTime = data.length > 0 ? data[data.length - 1].time : 0
  const now = (seekable && paused)
    ? seekTime
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
        panStartSeekTime.current = seekTimeRef.current
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
          // 向右拖（dx > 0）= 往历史看 = seekTime 减小
          const newSeekTime = panStartSeekTime.current - dx * secsPerPixel
          const minSeekTime = durationRef.current  // 最多看到 time=0
          const maxSeekTime = Math.max(durationRef.current, currentTimeRef.current ?? 0)
          const clamped = Math.max(minSeekTime, Math.min(newSeekTime, maxSeekTime))
          updateSeekTime(clamped)
          const newStartTime = Math.max(0, clamped - durationRef.current)
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
          currentTimeLine={currentTime !== undefined ? Math.min(currentTime, endTime) : currentTime}
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
