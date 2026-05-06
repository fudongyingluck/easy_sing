/**
 * 三段式视口 + 红线计算（录制/拖动共用同一套逻辑）。
 *
 * anchor = currentTime（录制中）或 seekTime（暂停拖动中），
 * 两者语义对称：视口和红线位置均由 anchor 推导，切换时无跳变。
 *
 *   阶段一 [0, duration/2]：视口钉在 [0, duration]，红线从左移到中央
 *   阶段二 [duration/2, totalDuration-duration/2]：红线居中，视口随 anchor 滚动
 *   阶段三 [totalDuration-duration/2, totalDuration]：视口钉在末尾，红线移到右边缘
 *
 * @param anchor        时间锚点（currentTime 或 seekTime）
 * @param duration      视口时间跨度
 * @param totalDuration 时长上限（0 表示无上限，无阶段三）
 */
export function computeViewport(anchor: number, duration: number, totalDuration = 0) {
  const raw = Math.max(duration, anchor + duration / 2)
  const endTime = totalDuration > 0 ? Math.min(raw, totalDuration) : raw
  return {
    startTime: Math.max(0, endTime - duration),
    endTime,
    currentTimeLine: anchor,
  }
}
