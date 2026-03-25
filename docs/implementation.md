# 实现思路文档

记录当前各模块的实现方案，避免重复踩坑。

---

## 音高检测

**库**：`react-native-pitchy`

Pitchy 在底层直接接管麦克风，通过事件回调输出检测到的音高频率。之前尝试过 `react-native-audio-api` 的 AnalyserNode + YIN 算法，但在新架构（Fabric）下事件丢失，最终换成 Pitchy。

```ts
Pitchy.init({ bufferSize: 2048, minVolume: -50 })
Pitchy.addListener(({ pitch }) => { ... })
Pitchy.start()
```

**注意**：Pitchy 的 `init()` 会把 iOS audio session 设置为 `PlayAndRecord + Measurement + DefaultToSpeaker`，这个 session 在 `stop()` 后不会被重置。

---

## 钢琴发音

**库**：`react-native-sound`，加载真实钢琴采样 mp3 文件

音频文件位于 `ios/PitchPerfect/Audio/`，共 89 个文件，覆盖所有音符和八度（A/B/C/D/E/F/G + 升降号）。

```ts
// 路径必须带子目录前缀
new Sound('Audio/C4.mp3', Sound.MAIN_BUNDLE, callback)
```

**注意**：
- 升调用降调文件名（C# → Db，D# → Eb，F# → Gb，G# → Ab，A# → Bb）
- 加载结果缓存到 Map，避免重复 IO

**关键坑：iOS Audio Session 冲突**

Pitchy（音高检测）会把 iOS audio session 设成 `PlayAndRecord + Measurement`。如果 audio session 未提前配置，`react-native-sound` 的 `Playback` 类别会和 Pitchy 的 `PlayAndRecord` 冲突，导致 `!pri` (Code=561017449) 错误无声音。

**解决方案**：在 `AppDelegate.swift` App 启动时统一配置 audio session：
```swift
try? audioSession.setCategory(.playAndRecord, mode: .default,
    options: [.defaultToSpeaker, .mixWithOthers])
try? audioSession.setActive(true)
```

---

## 录音状态机

共 4 个状态，控制按钮和钢琴锁定逻辑都依赖此状态：

```
idle → (点击开始) → recording → (点击暂停) → paused
paused → (点击继续) → recording
paused → (点击保存/放弃) → idle
```

**钢琴锁定规则**：
- `recording` 状态：钢琴 disabled + 显示遮罩（提示双击切换钢琴模式）
- `paused` 状态：钢琴 disabled，不显示遮罩
- `idle` 状态：钢琴可用

---

## 音高曲线图（PitchChart）

基于 `react-native-svg` 手动绘制。

**核心逻辑**：
- X 轴：显示最近 N 秒（默认 5 秒），时间窗口随 `currentTime` 滚动
- Y 轴：按 MIDI 音符线性映射，只标注白键（C/D/E/F/G/A/B）
- 曲线分段：相邻两点时间差 < 阈值 且音高差 < 阈值才连线，否则断开
- 判断连线时用 `prevValidMidi`（上一个有效 MIDI 点）而非 `filteredData[i-1]`，避免跳过无效点后连线逻辑出错

---

## 导航结构

底部 Tab 导航（react-navigation）：
- Tab 1：练习页（PracticeScreen）- 主功能
- Tab 2：历史记录（RecordingsScreen）

---

## 已知问题 / 注意事项

- 钢琴音频合成使用 triangle 波形，音色偏电子琴，不是真实钢琴音色（因为只有 B/C 的 mp3 文件，其他音符只能合成）
- 真实录音功能（mp3 文件保存）目前是 stub，`audioPath` 返回空字符串
- `react-native-pitchy` 在模拟器上无法使用麦克风，需真机测试
