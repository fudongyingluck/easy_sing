import React, { useState, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, PanGestureHandler } from 'react-native'
import { CONFIG } from '../config/constants'
import { noteNameToMidi, midiToNoteName, noteNameToFreq } from '../utils/noteUtils'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SCROLL_BAR_HEIGHT = 6
const SCROLL_BAR_MARGIN = 8

interface PianoProps {
  startNote: string
  endNote: string
  disabled?: boolean
  onKeyPress?: (note: string, freq: number) => void
}

export function Piano({ startNote, endNote, disabled = false, onKeyPress }: PianoProps) {
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [contentWidth, setContentWidth] = useState(0)
  const [scrollViewWidth, setScrollViewWidth] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const scrollViewRef = useRef<ScrollView>(null)
  const dragStartX = useRef(0)
  const dragStartScrollOffset = useRef(0)

  // 生成琴键列表
  const generateKeys = () => {
    const startMidi = noteNameToMidi(startNote)
    const endMidi = noteNameToMidi(endNote)
    const keys: Array<{ note: string; isBlack: boolean; midi: number; whiteKeyIndex: number }> = []
    let whiteKeyIndex = 0

    for (let midi = startMidi; midi <= endMidi; midi++) {
      const note = midiToNoteName(midi)
      const noteName = note.slice(0, -1)
      const isBlack = noteName.includes('#')
      keys.push({
        note,
        isBlack,
        midi,
        whiteKeyIndex: isBlack ? whiteKeyIndex - 1 : whiteKeyIndex++
      })
    }

    return keys
  }

  const keys = generateKeys()
  const whiteKeys = keys.filter(k => !k.isBlack)
  const blackKeys = keys.filter(k => k.isBlack)

  const whiteKeyWidth = Math.max(
    CONFIG.WHITE_KEY_MIN_WIDTH,
    SCREEN_WIDTH / Math.min(whiteKeys.length, 10) * 0.9
  )
  const whiteKeyTotalWidth = whiteKeyWidth + 2
  const blackKeyWidth = whiteKeyWidth * 0.6
  const totalPianoWidth = whiteKeyTotalWidth * whiteKeys.length + 16

  // 计算滚动条位置（减去左右padding 16）
  const trackWidth = scrollViewWidth > 0 ? scrollViewWidth - 32 : 0
  const scrollBarWidth = Math.max(
    60,
    trackWidth > 0 && contentWidth > 0
      ? (trackWidth / contentWidth) * trackWidth
      : 60
  )
  const scrollBarLeft = trackWidth > 0 && contentWidth > 0
    ? (scrollOffset / (contentWidth - scrollViewWidth)) * (trackWidth - scrollBarWidth)
    : 0

  const getBlackKeyOffset = (whiteKeyIndex: number) => {
    return whiteKeyTotalWidth * whiteKeyIndex + whiteKeyWidth * 0.7
  }

  const handlePress = (note: string) => {
    if (disabled) return
    setPressedKey(note)
    setTimeout(() => setPressedKey(null), 100)

    const freq = noteNameToFreq(note)
    if (onKeyPress && freq > 0) {
      onKeyPress(note, freq)
    }
  }

  const handleScroll = (event: any) => {
    if (!isDragging) {
      setScrollOffset(event.nativeEvent.contentOffset.x)
    }
  }

  const handleContentSizeChange = (width: number) => {
    setContentWidth(width)
  }

  const handleLayout = (event: any) => {
    setScrollViewWidth(event.nativeEvent.layout.width)
  }

  // 滚动条拖拽开始
  const handleScrollBarTouchStart = (event: any) => {
    setIsDragging(true)
    dragStartX.current = event.nativeEvent.pageX
    dragStartScrollOffset.current = scrollOffset
  }

  // 滚动条拖拽移动
  const handleScrollBarTouchMove = (event: any) => {
    if (!isDragging || trackWidth <= 0 || contentWidth <= 0) return

    const deltaX = event.nativeEvent.pageX - dragStartX.current
    const maxScrollOffset = contentWidth - scrollViewWidth
    const maxThumbOffset = trackWidth - scrollBarWidth

    if (maxThumbOffset > 0) {
      const newScrollOffset = dragStartScrollOffset.current + (deltaX / maxThumbOffset) * maxScrollOffset
      const clampedScrollOffset = Math.max(0, Math.min(maxScrollOffset, newScrollOffset))
      setScrollOffset(clampedScrollOffset)
      scrollViewRef.current?.scrollTo({ x: clampedScrollOffset, animated: false })
    }
  }

  // 滚动条拖拽结束
  const handleScrollBarTouchEnd = () => {
    setIsDragging(false)
  }

  // 是否需要显示滚动条
  const showScrollBar = contentWidth > scrollViewWidth && scrollViewWidth > 0

  return (
    <View style={styles.container}>
      {/* 钢琴区域 */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { width: totalPianoWidth }]}
        scrollEnabled={!isDragging}
        bounces={true}
        alwaysBounceHorizontal={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
      >
        <View style={[styles.pianoContainer, { width: totalPianoWidth - 16 }]}>
          {/* 白键 */}
          <View style={styles.whiteKeysRow}>
            {whiteKeys.map((key) => (
              <TouchableOpacity
                key={key.note}
                style={[
                  styles.whiteKey,
                  { width: whiteKeyWidth },
                  pressedKey === key.note && styles.whiteKeyPressed,
                  disabled && styles.disabledKey
                ]}
                onPress={() => handlePress(key.note)}
                activeOpacity={0.7}
              >
                {key.note.startsWith('C') && (
                  <Text style={styles.octaveLabelOnKey}>{key.note}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* 黑键 */}
          <View style={styles.blackKeysRow}>
            {blackKeys.map((key) => {
              const offset = getBlackKeyOffset(key.whiteKeyIndex)
              return (
                <TouchableOpacity
                  key={key.note}
                  style={[
                    styles.blackKey,
                    {
                      width: blackKeyWidth,
                      left: offset
                    },
                    pressedKey === key.note && styles.blackKeyPressed,
                    disabled && styles.disabledKey
                  ]}
                  onPress={() => handlePress(key.note)}
                  activeOpacity={0.7}
                />
              )
            })}
          </View>
        </View>
      </ScrollView>

      {/* 滚动条区域 */}
      {showScrollBar && (
        <View style={styles.scrollBarContainer}>
          <View style={styles.scrollBarTrack}>
            <View
              style={[
                styles.scrollBarThumb,
                {
                  width: scrollBarWidth,
                  left: scrollBarLeft
                },
                isDragging && styles.scrollBarThumbDragging
              ]}
              onTouchStart={handleScrollBarTouchStart}
              onTouchMove={handleScrollBarTouchMove}
              onTouchEnd={handleScrollBarTouchEnd}
              onTouchCancel={handleScrollBarTouchEnd}
            />
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#333',
    height: 175
  },
  scrollContent: {
    paddingHorizontal: 8,
    height: 150
  },
  pianoContainer: {
    position: 'relative',
    height: 150
  },
  whiteKeysRow: {
    flexDirection: 'row',
    height: '100%'
  },
  whiteKey: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    marginHorizontal: 1,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 4
  },
  whiteKeyPressed: {
    backgroundColor: '#e8e8e8'
  },
  blackKeysRow: {
    position: 'absolute',
    top: 0,
    left: 8,
    height: '60%'
  },
  blackKey: {
    position: 'absolute',
    backgroundColor: '#222',
    height: '100%',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    zIndex: 10
  },
  blackKeyPressed: {
    backgroundColor: '#444'
  },
  disabledKey: {
    opacity: 0.5
  },
  octaveLabelOnKey: {
    color: '#666',
    fontSize: 9,
    textAlign: 'center',
    fontWeight: '500'
  },
  scrollBarContainer: {
    height: SCROLL_BAR_HEIGHT + SCROLL_BAR_MARGIN * 2,
    paddingHorizontal: 16,
    paddingTop: SCROLL_BAR_MARGIN,
    paddingBottom: SCROLL_BAR_MARGIN,
    justifyContent: 'center'
  },
  scrollBarTrack: {
    height: SCROLL_BAR_HEIGHT,
    backgroundColor: '#555',
    borderRadius: SCROLL_BAR_HEIGHT / 2,
    position: 'relative'
  },
  scrollBarThumb: {
    position: 'absolute',
    top: 0,
    height: SCROLL_BAR_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: SCROLL_BAR_HEIGHT / 2,
    opacity: 0.8
  },
  scrollBarThumbDragging: {
    opacity: 1
  }
})
