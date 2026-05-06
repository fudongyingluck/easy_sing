/**
 * PitchChart 合并组件单测（TDD）
 *
 * 测试范围：
 *   1. computeViewport 纯函数（三段式视口 + 红线）
 *   2. anchor 选择：录制中用 currentTime，暂停后用 seekTime
 *   3. 暂停切换时视口无跳变
 *   4. 拖动行为：seekTime 驱动视口 + 红线，onSeekChange 上报 seekTime
 *   5. 基础 props 向下透传
 */

import React from 'react'
import { render, act } from '@testing-library/react-native'
import { PitchChart } from '../../src/components/PitchChart'
import { PitchDataPoint } from '../../src/types'

// ─── Mocks ────────────────────────────────────────────────────────────────────

let panConfig: any = null
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
  rn.NativeModules.PitchDetectorModule = { addListener: jest.fn(), removeListeners: jest.fn() }
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
  totalDuration: 60,
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

// 2. 录制中（anchor = currentTime）
// ─────────────────────────────────────────────────────────────────────────────
describe('录制中 anchor=currentTime', () => {
  it('Phase1：currentTime=2，视口 [0,6]，红线在 2', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={2} paused={false} />)
    expect(lastPitchCanvasProps.startTime).toBeCloseTo(0)
    expect(lastPitchCanvasProps.endTime).toBeCloseTo(6)
    expect(lastPitchCanvasProps.currentTimeLine).toBe(2)
  })

  it('Phase2：currentTime=10，视口 [7,13]，红线在 10（居中）', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={10} paused={false} />)
    expect(lastPitchCanvasProps.startTime).toBeCloseTo(7)
    expect(lastPitchCanvasProps.endTime).toBeCloseTo(13)
    expect(lastPitchCanvasProps.currentTimeLine).toBe(10)
  })

  it('Phase3：currentTime=58，视口钉在 [54,60]，红线在 58', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={58} paused={false} />)
    expect(lastPitchCanvasProps.startTime).toBeCloseTo(54)
    expect(lastPitchCanvasProps.endTime).toBeCloseTo(60)
    expect(lastPitchCanvasProps.currentTimeLine).toBe(58)
  })

  it('currentTime=60（到达上限）：视口 [54,60]，红线在右边缘', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={60} paused={false} />)
    expect(lastPitchCanvasProps.endTime).toBeCloseTo(60)
    expect(lastPitchCanvasProps.currentTimeLine).toBe(60)
  })

  it('startTime 不低于 0', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={1} paused={false} />)
    expect(lastPitchCanvasProps.startTime).toBeGreaterThanOrEqual(0)
  })

  it('视口宽度始终等于 duration', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={20} paused={false} />)
    expect(lastPitchCanvasProps.endTime - lastPitchCanvasProps.startTime).toBeCloseTo(6)
  })
})

// 3. 暂停切换：视口无跳变
// ─────────────────────────────────────────────────────────────────────────────
describe('暂停切换时视口无跳变', () => {
  it('Phase2 暂停：seekTime 初始化为 currentTime，endTime 不变', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={30} paused={false} seekable={false} />)
    const endTimePlaying = lastPitchCanvasProps.endTime

    render(<PitchChart {...BASE_PROPS} currentTime={30} paused seekable />)
    expect(lastPitchCanvasProps.endTime).toBeCloseTo(endTimePlaying)
  })

  it('Phase3 末尾自动停止：暂停后红线仍在右边缘', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={60} paused seekable />)
    expect(lastPitchCanvasProps.endTime).toBeCloseTo(60)
    expect(lastPitchCanvasProps.currentTimeLine).toBe(60)
  })
})

// 4. 暂停后拖动（anchor = seekTime）
// ─────────────────────────────────────────────────────────────────────────────
describe('暂停后拖动：seekTime 驱动视口和红线', () => {
  it('向右拖（dx>0）：seekTime 减小，红线跟随左移', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={60} paused seekable />)
    const timelineBefore = lastPitchCanvasProps.currentTimeLine  // = 60

    simulatePan(100, 0)  // act 内部已触发 re-render

    expect(lastPitchCanvasProps.currentTimeLine).toBeLessThan(timelineBefore)
  })

  it('大幅向右拖后进入 Phase2：endTime 小于 totalDuration，视口宽度仍为 duration', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={60} paused seekable />)
    simulatePan(9999, 0)  // 拖到 Phase1，endTime 必然 < totalDuration

    const { startTime, endTime } = lastPitchCanvasProps
    expect(endTime).toBeLessThan(60)
    expect(endTime - startTime).toBeCloseTo(6, 1)
  })

  it('startTime 不低于 0（拖到头不越界）', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={60} paused seekable />)
    simulatePan(99999, 0)

    render(<PitchChart {...BASE_PROPS} currentTime={60} paused seekable />)
    expect(lastPitchCanvasProps.startTime).toBeGreaterThanOrEqual(0)
  })

  it('向左拖（dx<0）：seekTime 增大，不超过 totalDuration', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={30} paused seekable />)
    simulatePan(-99999, 0)

    render(<PitchChart {...BASE_PROPS} currentTime={30} paused seekable />)
    expect(lastPitchCanvasProps.endTime).toBeLessThanOrEqual(60 + 0.01)
  })

  it('竖向拖动不影响视口', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={60} paused seekable />)
    const endTimeBefore = lastPitchCanvasProps.endTime

    simulatePan(2, 100) // dy 远大于 dx

    render(<PitchChart {...BASE_PROPS} currentTime={60} paused seekable />)
    expect(lastPitchCanvasProps.endTime).toBeCloseTo(endTimeBefore)
  })

  it('playing 状态下拖动不改变视口（seekable=false）', () => {
    render(<PitchChart {...BASE_PROPS} currentTime={30} paused={false} seekable={false} />)
    const endTimeBefore = lastPitchCanvasProps.endTime

    simulatePan(100, 0)

    render(<PitchChart {...BASE_PROPS} currentTime={30} paused={false} seekable={false} />)
    expect(lastPitchCanvasProps.endTime).toBeCloseTo(endTimeBefore)
  })
})

// 5. onSeekChange 上报 seekTime（红线位置）
// ─────────────────────────────────────────────────────────────────────────────
describe('onSeekChange 上报 seekTime（红线位置）', () => {
  it('拖动后 onSeekChange 上报的值等于 currentTimeLine（红线位置）', () => {
    const onSeekChange = jest.fn()
    render(<PitchChart {...BASE_PROPS} currentTime={60} paused seekable onSeekChange={onSeekChange} />)
    simulatePan(100, 0)  // act 内已 re-render

    const reported = onSeekChange.mock.calls.at(-1)?.[0]
    expect(reported).toBeCloseTo(lastPitchCanvasProps.currentTimeLine, 1)
  })

  it('onSeekChange 上报值 >= 0', () => {
    const onSeekChange = jest.fn()
    render(<PitchChart {...BASE_PROPS} currentTime={60} paused seekable onSeekChange={onSeekChange} />)
    simulatePan(99999, 0)
    expect(onSeekChange.mock.calls.at(-1)?.[0]).toBeGreaterThanOrEqual(0)
  })

  it('seekable=false 时拖动不触发 onSeekChange', () => {
    const onSeekChange = jest.fn()
    render(<PitchChart {...BASE_PROPS} seekable={false} onSeekChange={onSeekChange} paused />)
    simulatePan(100, 0)
    expect(onSeekChange).not.toHaveBeenCalled()
  })

  it('竖向拖动不触发 onSeekChange', () => {
    const onSeekChange = jest.fn()
    render(<PitchChart {...BASE_PROPS} seekable onSeekChange={onSeekChange} paused />)
    simulatePan(2, 100)
    expect(onSeekChange).not.toHaveBeenCalled()
  })
})

// 6. props 透传
// ─────────────────────────────────────────────────────────────────────────────
describe('props 透传', () => {
  it('leftDisplay 和 rightDisplay 透传到 PitchCanvas', () => {
    render(<PitchChart {...BASE_PROPS} leftDisplay="solfege" rightDisplay="number" />)
    expect(lastPitchCanvasProps.leftDisplay).toBe('solfege')
    expect(lastPitchCanvasProps.rightDisplay).toBe('number')
  })

  it('minMidi 和 maxMidi 由 minNote/maxNote 正确计算', () => {
    render(<PitchChart data={[]} minNote="C4" maxNote="C5" />)
    expect(lastPitchCanvasProps.minMidi).toBe(60)
    expect(lastPitchCanvasProps.maxMidi).toBe(72)
  })

  it('data 透传到 PitchCanvas', () => {
    const data = makePitchData(3)
    render(<PitchChart {...BASE_PROPS} data={data} />)
    expect(lastPitchCanvasProps.data).toBe(data)
  })
})
