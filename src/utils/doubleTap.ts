import { useRef, useCallback } from 'react'
import { CONFIG } from '../config/constants'

// Hook形式，便于在React组件中使用
export function useDoubleTap(callback: () => void) {
  const lastTapTimeRef = useRef<number>(0)

  const handleTap = useCallback(() => {
    const currentTime = Date.now()
    const timeDiff = currentTime - lastTapTimeRef.current

    if (timeDiff < CONFIG.DOUBLE_TAP_DELAY && timeDiff > 0) {
      // 检测到双击
      callback()
      lastTapTimeRef.current = 0
    } else {
      // 记录点击时间
      lastTapTimeRef.current = currentTime
    }
  }, [callback])

  const reset = useCallback(() => {
    lastTapTimeRef.current = 0
  }, [])

  return {
    handleTap,
    reset
  }
}
