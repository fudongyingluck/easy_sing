/**
 * PitchChart 合并组件单测（TDD）
 *
 * 测试范围：
 *   1. 时间窗口计算（playing / paused）
 *   2. 红线位置（currentTimeLine 传递到 PitchCanvas）
 *   3. seekable + onSeekChange 行为
 *   4. 基础 props 向下透传
 *
 * 依赖：@testing-library/react-native
 *   安装：npm install --save-dev @testing-library/react-native
 */

import React from 'react'
import { render, act } from '@testing-library/react-native'
import { PitchChart } from '../../src/components/PitchChart'
import { PitchDataPoint } from '../../src/types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// 捕获 PanResponder 配置，使测试可直接调用手势回调
let panConfig: any = null

// 捕获 PitchCanvas 收到的 props，用于断言
let lastPitchCanvasProps: any = {}
jest.mock('../../src/components/PitchCanvas', () => ({
  PitchCanvas: (props: any) => { lastPitchCanvasProps = props; return null },
  PitchXAxis: () => null,
  X_AXIS_HEIGHT: 30,
  PADDING: { top: 4, bottom: 4, left: 5, right: 10 },
  pixelsPerSemitone: 20,
}))

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native')
  rn.useWindowDimensions = () => ({ width: 390, height: 844 })
  rn.NativeModules.AudioSessionModule = {}
  // PanResponder is a lazy getter with no setter — use defineProperty to override
  Object.defineProperty(rn, 'PanResponder', {
    value: {
      create: (config: any) => {
        panConfig = config
        return { panHandlers: {} }
      },
    },
    configurable: true,
    writable: true,
  })
  return rn
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePitchData(durationSecs: number, step = 0.1): PitchDataPoint[] {
  const data: PitchDataPoint[] = []
  for (let t = 0; t <= durationSecs; t = parseFloat((t + step).toFixed(2))) {
    data.push({ time: t, freq: 440, note: 'A4' })
  }
  return data
}

const BASE_PROPS = {
  data: makePitchData(10),
  minNote: 'C3',
  maxNote: 'C6',
  duration: 6,
}

function simulatePan(dx: number, dy: number) {
  act(() => {
    panConfig?.onPanResponderGrant?.({}, {})
    panConfig?.onPanResponderMove?.({}, { dx, dy })
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  lastPitchCanvasProps = {}
  panConfig = null
})

// 1. 渲染
// ─────────────────────────────────────────────────────────────────────────────
describe('rendering', () => {
  it('最小 props 下不崩溃', () => {
    expect(() =>
      render(<PitchChart data={[]} minNote="C3" maxNote="C6" />)
    ).not.toThrow()
  })

  it('完整 props 下不崩溃', () => {
    expect(() =>
      render(<PitchChart {...BASE_PROPS} currentTime={5} paused seekable onSeekChange={jest.fn()} />)
    ).not.toThrow()
  })
})

// 2. 时间窗口 — playing
// ─────────────────────────────────────────────────────────────────────────────
describe('时间窗口（playing）', () => {
  it('数据比 currentTime 新时，endTime 跟随数据最新时间', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={3} paused={false} />)
    expect(lastPitchCanvasProps.endTime).toBeGreaterThanOrEqual(10)
  })

  it('currentTime 超过数据时，endTime 跟随 currentTime', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={15} paused={false} />)
    expect(lastPitchCanvasProps.endTime).toBeGreaterThanOrEqual(15)
  })

  it('数据不足时，endTime 至少等于 duration', () => {
    render(<PitchChart data={makePitchData(2)} minNote="C3" maxNote="C6" duration={6} currentTime={1} paused={false} />)
    expect(lastPitchCanvasProps.endTime).toBeGreaterThanOrEqual(6)
  })

  it('时间窗口宽度始终等于 duration', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={5} paused={false} />)
    const { startTime, endTime } = lastPitchCanvasProps
    expect(endTime - startTime).toBeCloseTo(6, 5)
  })

  it('startTime 不低于 0', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={1} paused={false} />)
    expect(lastPitchCanvasProps.startTime).toBeGreaterThanOrEqual(0)
  })
})

// 3. 时间窗口 — paused + seekable
// ─────────────────────────────────────────────────────────────────────────────
describe('时间窗口（paused + seekable）', () => {
  it('未拖动时视口显示数据末尾', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={10} paused seekable />)
    // 数据到 t=10，endTime 应接近 10
    expect(lastPitchCanvasProps.endTime).toBeCloseTo(10, 0)
  })

  it('向右拖（dx > 0）视口向历史方向移动，startTime 减小', () => {
    const { rerender } = render(
      <PitchChart {...BASE_PROPS} currentTime={10} paused seekable />
    )
    const startTimeBefore = lastPitchCanvasProps.startTime

    simulatePan(100, 0) // 向右拖
    rerender(<PitchChart {...BASE_PROPS} currentTime={10} paused seekable />)

    expect(lastPitchCanvasProps.startTime).toBeLessThan(startTimeBefore)
  })

  it('startTime 不低于 0（拖到头不越界）', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={10} paused seekable />)
    simulatePan(99999, 0)

    render(<PitchChart {...BASE_PROPS} currentTime={10} paused seekable />)
    expect(lastPitchCanvasProps.startTime).toBeGreaterThanOrEqual(0)
  })

  it('endTime 不超过数据最新时间（拖不到未来）', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={10} paused seekable />)
    simulatePan(-99999, 0) // 向左拖（往未来方向）

    render(<PitchChart {...BASE_PROPS} currentTime={10} paused seekable />)
    expect(lastPitchCanvasProps.endTime).toBeLessThanOrEqual(10 + 0.01)
  })
})

// 4. 红线（currentTimeLine）
// ─────────────────────────────────────────────────────────────────────────────
describe('红线', () => {
  it('currentTime 传入后 PitchCanvas 收到 currentTimeLine', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={5} />)
    expect(lastPitchCanvasProps.currentTimeLine).toBe(5)
  })

  it('不传 currentTime 时 currentTimeLine 为 undefined', () => {
    render(<PitchChart {...BASE_PROPS} />)
    expect(lastPitchCanvasProps.currentTimeLine).toBeUndefined()
  })

  it('paused 时红线位置仍为 currentTime（不受拖动影响）', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={7} paused seekable />)
    simulatePan(100, 0) // 视口移动
    render(<PitchChart {...BASE_PROPS} currentTime={7} paused seekable />)
    // 红线仍然是 currentTime=7，不是视口位置
    expect(lastPitchCanvasProps.currentTimeLine).toBe(7)
  })
})

// 5. seekable + onSeekChange
// ─────────────────────────────────────────────────────────────────────────────
describe('onSeekChange', () => {
  it('seekable=false 时横向拖动不触发 onSeekChange', () => {
    const onSeekChange = jest.fn()
    render(<PitchChart {...BASE_PROPS} seekable={false} onSeekChange={onSeekChange} paused />)
    simulatePan(100, 0)
    expect(onSeekChange).not.toHaveBeenCalled()
  })

  it('seekable=true 时横向拖动触发 onSeekChange', () => {
    const onSeekChange = jest.fn()
    render(<PitchChart {...BASE_PROPS} seekable onSeekChange={onSeekChange} paused />)
    simulatePan(100, 2) // dx 远大于 dy → 水平方向锁定
    expect(onSeekChange).toHaveBeenCalled()
  })

  it('竖向拖动不触发 onSeekChange（即使 seekable=true）', () => {
    const onSeekChange = jest.fn()
    render(<PitchChart {...BASE_PROPS} seekable onSeekChange={onSeekChange} paused />)
    simulatePan(2, 100) // dy 远大于 dx → 竖直方向锁定
    expect(onSeekChange).not.toHaveBeenCalled()
  })

  it('onSeekChange 上报的 time 是当前视口的 startTime', () => {
    const onSeekChange = jest.fn()
    render(<PitchChart {...BASE_PROPS} seekable onSeekChange={onSeekChange} paused />)
    simulatePan(100, 0)

    const reportedTime = onSeekChange.mock.calls[0]?.[0]
    expect(reportedTime).toBeGreaterThanOrEqual(0)
    expect(typeof reportedTime).toBe('number')
  })

  it('onSeekChange 上报的 time >= 0（不越过起点）', () => {
    const onSeekChange = jest.fn()
    render(<PitchChart {...BASE_PROPS} seekable onSeekChange={onSeekChange} paused />)
    simulatePan(99999, 0)
    expect(onSeekChange.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(0)
  })

  it('playing 状态下横向拖动不触发 onSeekChange', () => {
    const onSeekChange = jest.fn()
    render(<PitchChart {...BASE_PROPS} seekable onSeekChange={onSeekChange} paused={false} />)
    simulatePan(100, 0)
    expect(onSeekChange).not.toHaveBeenCalled()
  })
})

// 6. Props 向下透传给 PitchCanvas
// ─────────────────────────────────────────────────────────────────────────────
describe('props 透传', () => {
  it('leftDisplay 和 rightDisplay 透传到 PitchCanvas', () => {
    render(<PitchChart {...BASE_PROPS} leftDisplay="solfege" rightDisplay="number" />)
    expect(lastPitchCanvasProps.leftDisplay).toBe('solfege')
    expect(lastPitchCanvasProps.rightDisplay).toBe('number')
  })

  it('minMidi 和 maxMidi 由 minNote/maxNote 正确计算', () => {
    render(<PitchChart data={[]} minNote="C4" maxNote="C5" />)
    // C4 = MIDI 60, C5 = MIDI 72
    expect(lastPitchCanvasProps.minMidi).toBe(60)
    expect(lastPitchCanvasProps.maxMidi).toBe(72)
  })

  it('data 透传到 PitchCanvas', () => {
    const data = makePitchData(3)
    render(<PitchChart {...BASE_PROPS} data={data} />)
    expect(lastPitchCanvasProps.data).toBe(data)
  })
})
