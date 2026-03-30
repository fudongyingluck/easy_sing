# 实现思路文档

记录当前各模块的实现方案，避免重复踩坑。

---

## 音高检测

**方案**：iOS Native 模块（`PitchDetectorModule.mm`），AVAudioEngine + YIN 算法，在 native audio 线程完成检测，JS 线程零负担。

```ts
// JS 包装层：src/services/nativePitchRecorder.ts
nativePitchRecorder.startDetection()
nativePitchRecorder.addPitchListener((freq) => { ... })
nativePitchRecorder.stopDetection()
```

**历史**：曾经尝试过 `react-native-audio-api` AnalyserNode + JS 侧 YIN，在新架构（Fabric）下事件丢失；后换 `react-native-pitchy`，最终改成自研 native 模块，彻底解决性能和兼容性问题。

**注意**：native 模块只在真机可用，模拟器没有麦克风。

---

## 录音

**方案**：与音高检测共用同一个 `PitchDetectorModule`，AVAudioFile 直接写 WAV，录音和检测在同一个 AVAudioEngine tap 回调里完成。

```ts
nativePitchRecorder.startRecording()  // 开始写 WAV
nativePitchRecorder.stopRecording()   // 返回文件名
nativePitchRecorder.getRecordingsDirectory()  // 返回存储目录
```

音频文件存在 app 沙盒的 Documents 目录。重装 App 后 UUID 路径会变，播放时需用文件名重新拼路径（`audio.ts` 的 `playAudio` 已处理）。

**暂停/继续**：native 层支持 `pauseRecording()` / `resumeRecording()`，JS 侧同步维护 `totalPausedTime` 用于正确计算时长。

---

## iOS Audio Session 生命周期

**核心原则**：按需激活，用完释放，避免持续占用导致切 app 时爆破音或干扰其他 app 音频。

**AppDelegate**（App 启动时）：只设 category，不主动 activate：
```swift
try? AVAudioSession.sharedInstance().setCategory(
    .playAndRecord, mode: .default,
    options: [.defaultToSpeaker, .allowBluetooth]
)
```

**AudioSessionModule**（JS 可调用的 native 模块）：

| 方法 | 时机 | 作用 |
|------|------|------|
| `activateForRecordingPlayback()` | 开始录音前 | activate session，`mixWithOthers` |
| `resetForPlayback()` | 开始播放前 | activate session，`mixWithOthers` |
| `deactivate()` | 录音结束 / 播放结束 / 暂停播放 | `setActive(false, notifyOthersOnDeactivation)` 让其他 app 恢复音频 |

---

## 钢琴发音

**库**：`react-native-sound`，加载真实钢琴采样 mp3 文件。

音频文件位于 `ios/PitchPerfect/Audio/`，共 89 个文件，覆盖所有音符和八度。

```ts
new Sound('Audio/C4.mp3', Sound.MAIN_BUNDLE, callback)
```

**注意**：
- 升调用降调文件名（C# → Db，D# → Eb，F# → Gb，G# → Ab，A# → Bb）
- 加载结果缓存到 Map，避免重复 IO
- `react-native-sound` 懒加载（首次播放时才 require），避免模块初始化时修改 AVAudioSession 影响录音

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

## 音高曲线图

基于 `react-native-svg` 手动绘制，分三层组件：

- **`PitchCanvas`**：纯渲染组件（`React.memo`），接收预处理好的时间区间和数据，画网格、曲线、坐标标签。`PADDING` 和 `pixelsPerSemitone` 从此文件导出，供上层计算 `svgHeight`。
- **`PitchChart`**：录音实时曲线，时间窗口自动跟随最新数据，只支持竖向滚动。
- **`RecordingPitchChart`**：历史录音回放曲线，paused 时支持横向拖拽 seek，playing 时跟随 `currentTime`。

> ⚠️ 待重构：`PitchChart` 和 `RecordingPitchChart` 计划合并为同一组件。见 todo.md 和下方「交互行为设计」。

**组件 API（合并后）**：
```tsx
<PitchChart
  data={pitchData}
  minNote="C3"
  maxNote="C6"
  currentTime={currentTime}         // 红线位置（受控）
  paused={isPaused}
  seekable={true}                   // 是否允许横向拖拽
  onSeekChange={(time) => { ... }}  // 用户拖动时持续上报视口 startTime
  leftDisplay="english"
  rightDisplay="solfege"
/>
```

**交互行为设计**：

*录音场景（PracticeScreen）*

| 状态 | 横向拖拽 | 红线 | 底部按钮 |
|------|---------|------|---------|
| 录音中 | 禁用，视口跟随最新数据 | 固定在右侧 | `[暂停]` |
| 暂停 | 可拖拽回看历史，`onSeekChange` 更新 `seekTime` | 停在暂停位置 | `[放弃]` `[播放 ▶]` `[继续录音 ⏺]` `[保存]` |
| 暂停中试听 | 可拖拽，音频跟着 seek | 随播放进度移动 | `[放弃]` `[停止 ⏹]` `[继续录音 ⏺]` `[保存]` |

- 「播放 ▶」：从 `seekTime`（`onSeekChange` 最后上报值）开始播放已录音频
- 「停止 ⏹」：停止试听，红线回到暂停位置
- 「继续录音 ⏺」：停止试听（若在播放），视口跳回最新，恢复录音

*历史录音回放场景（RecordingsScreen）*

| 状态 | 横向拖拽 | 红线 |
|------|---------|------|
| 播放中 | 拖动时立即 `audioService.seekTo(time)` | 随 `currentTime` 向右移动 |
| 暂停 | 拖动时立即 seek，松手后从新位置继续 | 停在暂停位置 |

**曲线分段逻辑**：
- 相邻两点时间差 < 0.25s 且 MIDI 差 < 3 才连线，否则断开成独立点（dot）
- 连线用 Catmull-Rom 转 Bezier 曲线，平滑但不过度拟合
- 判断连线时比较 `prevValidMidi`（上一个有效 MIDI）而非 `filteredData[i-1]`，避免跳过无效点后误连

**左侧锚点**：在 `startTime` 前找最近一个有效点作为锚点加入渲染，防止视口左边缘线段突然消失。

**手势处理**：SVG 在新架构（Fabric）下会拦截触摸事件，PanResponder 必须挂在覆盖在 SVG 上方的透明 `View` 上，不能直接挂 ScrollView。

---

## 数据持久化

**音频文件**：WAV，存在 app 沙盒 Documents 目录，路径存在 `Recording.audioFilePath`。

**音高数据**：JSON 序列化后存 AsyncStorage，key 存在 `Recording.pitchDataKey`（格式：`@pitchperfect:pitch:{recordingId}`）。注意这是一个 AsyncStorage key，不是文件路径。

**录音元数据列表**：`@pitchperfect:recordings`，存 `Recording[]` 的 JSON。

**用户设置**：`@pitchperfect:settings`，存 `UserSettings` 的 JSON。

---

## 导航结构

底部 Tab 导航（react-navigation）：
- Tab 1：练习页（PracticeScreen）
- Tab 2：历史记录（RecordingsScreen）
- Tab 3：设置（SettingsScreen，内含二级页面 Modes）

各 Tab 通过 `navigation.addListener('focus', ...)` 在切换时重新加载数据。

---

## 已知问题 / 注意事项

- 录音后放弃：`deleteRecordingFiles` 只删了 AsyncStorage 的 pitch 数据，**未删除音频文件本身**（待验证和修复）
- 录制时长与保存时长不一致：录制显示 12s 保存后可能变 16s，末尾几秒播放无声音（可能是 `stopRecording` 时 AVAudioFile 还有未写入的缓冲帧）
