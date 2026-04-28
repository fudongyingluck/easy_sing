# 代码结构说明

## 整体架构

React Native (TypeScript) + iOS Native Modules。四个底部 Tab 页，共用一套 Native 音频引擎。

```
App.tsx
└── ThemeProvider（全局主题上下文）
    └── NavigationContainer
        └── BottomTabNavigator
            ├── PracticeScreen    练习
            ├── RecordingsScreen  记录
            ├── TemplatesScreen   模板
            └── SettingsScreen    设置
```

---

## src/ 目录

### screens/（4个页面）

| 文件 | 功能 |
|------|------|
| `PracticeScreen.tsx` | 主练习页。实时录音 + 音高曲线 + 虚拟钢琴 + 模板叠加。管理录音状态机（idle / recording / paused）。 |
| `RecordingsScreen.tsx` | 历史录音列表 + 全屏播放器（PlaybackPitchChart 回放音高曲线）。支持多选删除、导出分享、转为模板。 |
| `TemplatesScreen.tsx` | 模板管理。支持从外部音频导入、从历史录音创建、重命名、删除。导入时调用 Native 分析音高数据。 |
| `SettingsScreen.tsx` | 设置项：音域模式（预设 + 自定义）、音高检测频率、录音时长限制、显示偏好、深色模式、调试面板（三连击触发）。 |

---

### components/（5个组件）

| 文件 | 功能 |
|------|------|
| `PitchCanvas.tsx` | 核心绘图组件（react-native-svg）。根据传入的时间窗口（startTime/endTime）绘制：Y轴网格线 + 音符标签、音高曲线（Catmull-Rom 平滑 + 二分查找过滤可见段）、模板橙色参考线、当前时间红线。用 `memo` 包裹。同文件导出 `PitchXAxis`（X轴时间刻度，纯 View 实现）。 |
| `PitchChart.tsx` | 录音模式专用容器。管理视口时间窗口（currentTime 居中滚动）、竖向 ScrollView、手势（暂停时横向拖拽 seek + 竖向滚动）。内嵌 PitchCanvas。 |
| `PlaybackPitchChart.tsx` | 回放模式专用容器。用 `Animated.Value` 驱动视口平移（播放中跟随 currentTime，暂停时可拖拽 seek）。红线用 `position: absolute` 的 View overlay 绘制（不在 SVG 内，避免触发 SVG 整体重绘）。 |
| `Piano.tsx` | 虚拟钢琴键盘。根据音域范围动态渲染白键/黑键，点击触发音符播放。 |
| `NotePicker.tsx` | 音符选择器，用于设置页自定义音域的起止音选择。 |

> **PitchCanvas vs PitchChart vs PlaybackPitchChart 的分工**
> - `PitchCanvas`：只管"画"，不感知时间推进方式
> - `PitchChart`：录音模式的视口管理（实时跟随 currentTime）
> - `PlaybackPitchChart`：回放模式的视口管理（Animated 驱动 + seek 交互）

---

### services/（5个服务）

| 文件 | 功能 |
|------|------|
| `audio.ts` | `AudioService` 单例。封装录音生命周期（start/pause/resume/stop）、音高数据收集（10Hz 限流推送 UI）、历史录音回放（playAudio/pausePlayback/resumePlayback/seekTo）。依赖 `nativePitchRecorder` 和 `audioPlayer`。 |
| `nativePitchRecorder.ts` | 对 `PitchDetectorModule`（Native）的薄封装。暴露：startDetection / stopDetection / startRecording / stopRecording / pauseRecording / resumeRecording / addPitchListener / analyzeAudioFile / resolveRecordingPath 等方法。 |
| `storage.ts` | AsyncStorage 读写：用户设置（`@pitchperfect:settings`）、录音列表（`@pitchperfect:recordings`）、音高数据（`@pitchperfect:pitch:${id}`）。包含录音文件路径解析（兼容沙盒 UUID 变化）。 |
| `templateStorage.ts` | 模板的 AsyncStorage 读写（`@pitchperfect:templates`）。管理模板音频路径解析（三种来源：`file` / `exist_record` / `deleted_record`）。包含录音删除时的模板引用检查与迁移逻辑。 |
| `documentPicker.ts` | 对 `PitchDetectorModule` 中文件选取/复制/时长读取接口的薄封装（pickAudioFile / copyAudioFileToImports / getAudioDuration）。 |

---

### utils/（3个工具）

| 文件 | 功能 |
|------|------|
| `noteUtils.ts` | 音乐理论计算：freqToMidi / midiToNoteName / noteNameToMidi / midiToFreq / noteNameToFreq / getCentsDeviation / isPitchAccurate。 |
| `audioUtils.ts` | `AudioPlayer` 单例。管理钢琴音效的 Sound 对象缓存（react-native-sound）、playNote / stopAll / release。 |
| `doubleTap.ts` | `useDoubleTap` Hook。封装双击检测逻辑（300ms 间隔），练习页用于切换录音/钢琴模式。 |

---

### 其他

| 文件 | 功能 |
|------|------|
| `types/index.ts` | 全局类型定义：PitchDataPoint / PitchData / Recording / Mode / UserSettings / PitchTemplate / AppMode / RecordingState。 |
| `config/constants.ts` | 全局常量：CONFIG（图表时长、双击延迟、最大录音时长等）、PRESET_MODES（男声/女声/吉他/小提琴）、NOTE_NAMES。 |
| `context/ThemeContext.tsx` | 深色/浅色主题 Context。根据系统或用户选择提供 `colors` 色板。 |

---

## ios/ 目录（Native Modules）

| 文件 | 功能 |
|------|------|
| `PitchDetectorModule.mm` | 核心音频 Native 模块。AVAudioEngine 录音（WAV 文件写入）+ YIN 算法实时音高检测（滑窗，2048帧窗口 / 256帧步长）+ AUVoiceIO 语音处理（回声消除）+ 文件分析接口（analyzeAudioFile，后台线程）+ 文件选取/复制接口。向 JS 发送 `onPitchDetected` 事件。 |
| `AudioSessionModule.swift` | AVAudioSession 管理。resetForPlayback（混音播放模式）/ activateForRecordingPlayback / deactivate。监听路由变化，向 JS 发送 `onHeadphonesDisconnected` 事件。 |

---

## 数据流

```
Native 麦克风 (AVAudioEngine tap)
    │
    ├─→ WAV 文件写入（录音原始音频）
    │
    └─→ YIN 音高检测 → onPitchDetected 事件 → JS Bridge
                                                    │
                                            AudioService.onPitchEvent()
                                                    │
                                            ├─ pitchData.push()
                                            └─ (限流 100ms) → onPitchDataUpdate → setPitchData → PitchChart → PitchCanvas
```

## 存储结构

```
AsyncStorage
├── @pitchperfect:settings          UserSettings（用户偏好）
├── @pitchperfect:recordings        Recording[]（录音列表，不含音频数据）
├── @pitchperfect:templates         PitchTemplate[]（模板列表）
└── @pitchperfect:pitch:{id}        PitchData（音高点数据，按录音/模板 id 分开存）

Documents/PitchPerfect/
├── Recordings/                     WAV 录音文件
└── Imports/                        外部导入的音频文件（模板用）
```
