/**
 * computeViewport 纯函数单测
 *
 * 测试范围：
 *   1. 三段式视口计算（Phase 1 / 2 / 3）
 *   2. startTime 不低于 0 的保护
 *   3. 无时长上限（totalDuration=0）时无 Phase 3
 *   4. currentTimeLine 始终等于 anchor
 */

import { computeViewport } from '../../src/utils/viewportUtils'

const D = 6   // duration（视口宽度）
const T = 60  // totalDuration（时长上限）

// ─── Phase 1：anchor < duration/2，视口钉在 [0, duration] ─────────────────────
describe('Phase 1：视口钉在起点，红线从左移到中', () => {
  it('anchor=0：视口 [0,6]，红线在最左侧', () => {
    const r = computeViewport(0, D, T)
    expect(r.startTime).toBe(0)
    expect(r.endTime).toBe(6)
    expect(r.currentTimeLine).toBe(0)
  })

  it('anchor=2：视口仍 [0,6]，红线在 2', () => {
    const r = computeViewport(2, D, T)
    expect(r.startTime).toBe(0)
    expect(r.endTime).toBe(6)
    expect(r.currentTimeLine).toBe(2)
  })

  it('Phase1/2 边界 anchor=3(=duration/2)：视口 [0,6]，红线在中央', () => {
    const r = computeViewport(3, D, T)
    expect(r.startTime).toBe(0)
    expect(r.endTime).toBe(6)
    expect(r.currentTimeLine).toBe(3)
  })
})

// ─── Phase 2：红线居中，视口随 anchor 滚动 ────────────────────────────────────
describe('Phase 2：红线居中，视口跟随滚动', () => {
  it('anchor=10：视口 [7,13]，红线在 10', () => {
    const r = computeViewport(10, D, T)
    expect(r.startTime).toBeCloseTo(7)
    expect(r.endTime).toBeCloseTo(13)
    expect(r.currentTimeLine).toBe(10)
  })

  it('anchor=30：视口 [27,33]，红线在 30', () => {
    const r = computeViewport(30, D, T)
    expect(r.startTime).toBeCloseTo(27)
    expect(r.endTime).toBeCloseTo(33)
    expect(r.currentTimeLine).toBe(30)
  })

  it('视口宽度始终等于 duration', () => {
    const r = computeViewport(20, D, T)
    expect(r.endTime - r.startTime).toBeCloseTo(D)
  })

  it('Phase2/3 边界 anchor=57(=60-3)：视口 [54,60]，红线居中', () => {
    const r = computeViewport(57, D, T)
    expect(r.startTime).toBeCloseTo(54)
    expect(r.endTime).toBeCloseTo(60)
    expect(r.currentTimeLine).toBe(57)
  })
})

// ─── Phase 3：视口钉在末尾，红线继续右移 ─────────────────────────────────────
describe('Phase 3：视口钉在末尾，红线向右移', () => {
  it('anchor=58：视口钉在 [54,60]，红线在 58', () => {
    const r = computeViewport(58, D, T)
    expect(r.startTime).toBeCloseTo(54)
    expect(r.endTime).toBeCloseTo(60)
    expect(r.currentTimeLine).toBe(58)
  })

  it('anchor=60（到达上限）：视口 [54,60]，红线在右边缘 60', () => {
    const r = computeViewport(60, D, T)
    expect(r.startTime).toBeCloseTo(54)
    expect(r.endTime).toBeCloseTo(60)
    expect(r.currentTimeLine).toBe(60)
  })

  it('endTime 不超过 totalDuration', () => {
    const r = computeViewport(59, D, T)
    expect(r.endTime).toBeLessThanOrEqual(T)
  })
})

// ─── 无时长上限（totalDuration=0）─────────────────────────────────────────────
describe('无时长上限（totalDuration=0）', () => {
  it('anchor=100：视口正常滚动到 [97,103]，无 cap', () => {
    const r = computeViewport(100, D, 0)
    expect(r.startTime).toBeCloseTo(97)
    expect(r.endTime).toBeCloseTo(103)
    expect(r.currentTimeLine).toBe(100)
  })

  it('anchor=2：Phase1，视口 [0,6]', () => {
    const r = computeViewport(2, D, 0)
    expect(r.startTime).toBe(0)
    expect(r.endTime).toBe(6)
  })
})

// ─── 边界保护 ─────────────────────────────────────────────────────────────────
describe('边界保护', () => {
  it('startTime 不低于 0', () => {
    const r = computeViewport(1, D, 0)
    expect(r.startTime).toBeGreaterThanOrEqual(0)
  })

  it('anchor=0, totalDuration=0：startTime=0, endTime=duration', () => {
    const r = computeViewport(0, D, 0)
    expect(r.startTime).toBe(0)
    expect(r.endTime).toBe(D)
  })

  it('currentTimeLine 始终等于 anchor', () => {
    [0, 3, 10, 57, 60].forEach(anchor => {
      expect(computeViewport(anchor, D, T).currentTimeLine).toBe(anchor)
    })
  })
})
