# 待办事项（未来版本）

---

## 重构执行顺序

> 目标：在不破坏已有功能的前提下，逐步改善代码质量。
> 原则：先建安全网，再动核心逻辑；低风险改动先行，高风险重构后置。

### 阶段一：修复测试基础设施（前提条件）
1. 修复 Jest 配置，解决 ESM 模块（`@react-native-async-storage` 等）transform 问题，让测试能跑起来
2. 更新 `PitchChart.test.tsx` 对齐新的视口行为（红线居中逻辑），让现有测试通过

### 阶段二：低风险清理（零逻辑改动，可随时做）
对应 code_fix_1 中不涉及逻辑变更的条目，逐条独立提交：
- ~~**CF1-7**：删除 `CONFIG` 里未使用的 YIN 常量（纯删除）~~ ✅ 已完成
- ~~**CF1-6**：`PitchCanvas.tsx` 里的 `freqToMidi` 改为 import `noteUtils.ts` 的版本~~ ✅ 已完成（提取为 `freqToMidiFloat`，保留浮点精度）
- ~~**CF1-5**：`PracticeScreen` 改用 `useDoubleTap` Hook，或删除 `doubleTap.ts`（二选一）~~ ✅ 已完成（使用 `useDoubleTap`）

### ~~阶段三：补关键单测（重构前的安全网）~~ ✅ 已完成
在动核心逻辑之前，先给以下模块补测试：
- ~~`noteUtils.ts`：freqToMidi / midiToNoteName / noteNameToMidi / getCentsDeviation（纯函数，最好写）~~ ✅
- ~~`AudioService`：startRecording / pauseRecording / resumeRecording / stopRecording 的状态流转~~ ✅
- ~~`PracticeScreen` 录音状态机：idle → recording → paused → idle 的关键路径~~ ✅（以 `useRecording` Hook 测试覆盖）

### ~~阶段四：中风险重构（有测试保护后再做）~~ ✅ 已完成
- ~~**CF1-4**：统一路径解析逻辑到单一出口~~ ✅（commit `27250e6`：resolveAudioPath 迁移至 storage.ts；RecordingsScreen 中 3 处直接调用 resolveRecordingPath 为文件系统操作，不经过 resolveAudioPath 属于正确用法）
- ~~**CF1-3**：AudioService 录音/回放职责拆分（或命名空间隔离）~~ ✅（commit `27250e6`：已用 Recording / Playback / Session helpers 三区块重组，对外 API 不变）

### ~~阶段五：高风险重构（最后做）~~ ✅ 已完成
- ~~**CF1-1**：PracticeScreen 拆分 `useRecording` / `useTemplateAudio` Hook~~ ✅（commit `a923013`：两个 Hook 已抽出，PracticeScreen 缩减为纯 UI 层）
- **CF1-2**：模板音频纳入统一音频管理路径 — 暂不做。`useTemplateAudio` 自洽管理 Sound 生命周期，相关 Bug（放弃后钢琴声）已通过 `audioPlayer.release()` 修复，当前无明显风险

---

## Bug 列表

### ~~5. 历史播放器：播放到末尾偶发不归零~~（已解决）
- **状态**：✅ 已修复
- **现象**：播放到自然结束后，`currentTime` 偶发停留在末尾而不回到 0，红线不复位
- **根本原因**：竞态条件——`getCurrentTime` 的 native bridge 回调是异步的：
  1. `setInterval` 触发 → `sound.getCurrentTime(cb)` 发消息给 native（异步）
  2. `sound.play()` 完成回调触发 → `_clearPlayback()`（清 timer）→ `resolve()`
  3. `finally: setCurrentTime(0)` 归零
  4. native 响应 `getCurrentTime` → `onProgress(seconds)` → `setCurrentTime(seconds)` 把 0 覆盖回末尾时间
  - 第 4 步发生在第 3 步之后，因为 native 的回程需要几毫秒，JS 线程在此期间已跑完归零逻辑
- **修复方案**：在 `getCurrentTime` 回调内加 guard：`if (this.playbackSound === sound)`，sound 释放后到达的回调直接忽略。`=== sound` 比 `!= null` 更严格，可防止换歌时旧回调污染新进度
- **涉及文件**：`src/services/audio.ts`（`playAudio` 和 `resumePlayback` 的 timer 回调）

### ~~4. 历史播放器：首次拖动后点播放从头开始~~（已解决）
- **状态**：✅ 已修复
- **现象**：
  - 打开历史播放器，未播放时拖动红线到某位置，点播放 → 从 0 开始而非拖动位置
  - 第二次拖动再播放则正常
- **根本原因**：
  - 未播放时没有 sound 对象，`seekTo` 是空操作，拖动只更新了 `currentTime` state
  - `togglePlayPause` 第三个分支（无 sound 对象时）有一行多余的 `setCurrentTime(0)`，把拖动位置覆盖掉了
  - `startAudio` 没有传 `startTime`，始终从 0 开始加载音频
  - 第二次正常是因为第一次播放后 sound 对象还在（暂停状态），走的是 `resumePlayback` 分支，`seekTo` 有效
- **修复方案**：
  - `startAudio` 增加 `startTime` 参数，透传给 `audioService.playAudio`
  - 第三个分支删掉多余的 `setCurrentTime(0)`，改为 `startAudio(activeRecording, currentTime)`
- **涉及文件**：`src/screens/RecordingsScreen.tsx`（`startAudio` / `togglePlayPause`）

### ~~0. 录音中音高曲线和音频周期性掉段~~（已解决）
- **状态**：✅ 已修复
- **现象**：
  - 有模板时唱歌，音高曲线掉帧（图表不流畅）、听感有抖动；无模板时正常
- **根本原因**：
  - `AVAudioEngine` 开启了 Voice Processing（`setVoiceProcessingEnabled:YES` → AUVoiceIO），同时模板音频通过 `react-native-sound`（`AVAudioPlayer`）独立播放
  - `mainMixerNode.outputVolume = 0`（引擎自身输出为静音），导致 AUVoiceIO 从引擎侧拿不到正确的扬声器参考信号
  - `AVAudioPlayer` 另起音频路径输出声音，AUVoiceIO 的回声消除参考信号与实际输出不一致，在麦克风信号里产生伪影
  - 音高检测收到含伪影的麦克风信号 → 音高值抖动 → 图表掉帧 + 听感抖动
- **修复方案**：有模板时跳过 `setVoiceProcessingEnabled:YES`。`startDetection` 新增 `disableVoiceProcessing: BOOL` 参数，有模板时传 `true`。无模板时 VP 保持开启，保留降噪效果
- **涉及文件**：
  - `ios/PitchPerfect/PitchDetectorModule.mm`（`startDetection` 增加参数）
  - `src/services/nativePitchRecorder.ts`（透传参数）
  - `src/services/audio.ts`（`startRecording` 增加 `hasTemplate` 参数）
  - `src/hooks/useRecording.ts`（传入 `hasTemplate`）

### ~~1. 播放历史录音/模板时红线闪动 + 音高曲线消失~~（已解决）
- **状态**：✅ 已修复
- **现象**：
  - 播放历史录音或模板时，红线（当前时间指示线）以 100ms 频率闪动
  - 中间段（三段式中间部分）有，第一段和最后一段没有
  - 录音越长，闪动幅度越大
- **根本原因**：`PlaybackPitchChart` 中 `currentTime` 和 `viewportStart` 在不同渲染帧更新，导致 tearing：
  - `currentTime` 来自 prop，父组件每 100ms 更新，**同帧可用**
  - `viewportStart` 来自 state，更新路径是 `useEffect([currentTime]) → viewportAnim.setValue() → listener → setViewportStart()`，**比 currentTime 晚一帧**
  - 红线位置 = `(currentTime - viewportStart) / SECONDS_PER_SCREEN * width`，两者不同帧 → 每 100ms 闪一次
  - 第一段/最后一段 `viewportStart` 是固定值，不随 currentTime 变化，所以不闪
  - 中间段 `viewportStart` 每 100ms 都在变。录音越长，pitchData 越多，JS 线程越忙，React 可能批量处理多次 `setViewportStart` 导致 viewportStart 落后不止一帧，闪动幅度随之增大
- **修复方案**：播放时不从 state 读 `viewportStart`，改为在渲染时直接由 `currentTime` 计算 `effectiveViewportStart`，与 currentTime 同帧，消除 tearing。拖动/暂停时仍走 Animated + state，保留弹簧动画
- **涉及文件**：`src/components/PlaybackPitchChart.tsx`（第 93–97 行）

### ~~录制/拖动时红线超过右边框后消失~~（已解决）
- **状态**：✅ 已修复
- **现象**：
  - 录制接近时长上限（如 1 分钟）时，红线在到达右边框后会瞬间消失，停止后又回到右边框
  - 暂停后向左拖动（查看更早时段），松手时红线消失
- **根本原因（两个独立 bug，叠加表现）**：
  1. **PanResponder 闭包捕获了过期的 `totalDuration`**
     - `PanResponder` 在组件首次挂载时通过 `useRef(PanResponder.create(...))` 创建，内部闭包只捕获了**首次渲染时**的 `totalDuration` 值。
     - 而 `recordingDurationLimit` 是从 AsyncStorage 异步加载的，组件挂载时 `useState(600)` 是初始默认值（600 秒），加载完成后才更新为用户设置值（如 60 秒）。
     - 结果：闭包里 `maxSeekTime = 600`，拖动时 `seekTime` 可以超过 60，导致 `anchor > totalDuration`，`currentTimeLine > endTime`，红线因超出边界判断而不被渲染（消失）。
  2. **定时器超调（timer overshoot）**
     - 录音计时器通过 `setInterval` 轮询 `audioService.getRecordingElapsed()`，而 `onMaxDurationReached` 是另一个异步回调。
     - 在两者之间存在一个短暂窗口：`setInterval` 先读到 60.1 秒并调用 `setRecordingTime(60.1)`，`onMaxDurationReached` 还没来得及把它钳回 60。
     - 这段时间内 `currentTime = 60.1`，`anchor = 60.1 > endTime = 60`，红线条件判断失败，短暂消失。
- **修复方案**：
  1. 新增 `totalDurationRef`，用 `useEffect` 同步最新 prop 值，在 PanResponder 闭包内改用 `totalDurationRef.current`，确保 `maxSeekTime` 始终反映当前 `totalDuration`。
  2. 在 `computeViewport` 调用前对 `rawAnchor` 做钳位：`anchor = rawAnchor > totalDuration ? totalDuration : rawAnchor`，无论计时器超调还是拖动越界，红线都钉在右边框而不是消失。
- **涉及文件**：`src/components/PitchChart.tsx`

### ~~2. 偶发：点击「放弃」后出现钢琴声~~（已解决）
- **状态**：✅ 已修复
- **现象**：点击「放弃」停止录音后，会听到钢琴音播放出来
- **根本原因**：`discardRecording` 没有调用 `audioPlayer.release()`；iOS 在 audio session 重置时会恢复残留 Sound 对象的播放
- **修复方案**：在 `discardRecording` 中调用 `audioPlayer.release()`，确保所有钢琴 Sound 对象在 session 重置前被释放
- **涉及文件**：`src/hooks/useRecording.ts`

### 3. ~~模板橙色线加载后部分不显示~~（已解决）
- **状态**：✅ 已修复
- **现象**：
  - 选择模板后，视口内应显示的橙色模板线只有部分出现（如 3 条中只显示 1 条）
  - 点击"开始"录音后，缺失的线才突然出现
- **根本原因**：react-native-svg 的 native 层 bug：当 `<G>` 内部从 **0 个 Path** 首次增加到 **N 个 Path** 时，部分 Path 不渲染。等到下次任意 re-render 才补全。通过在模板加载后添加 debug overlay 确认：`tmpl:3`（3 条路径已计算），但视觉上只显示 1 条。
- **修复方案**：在 `PitchCanvas` 内部添加 `useEffect`，当 `templateData` 变化（从无到有）后，触发一次额外的 `forceUpdate`，使 react-native-svg 补全渲染。
- **涉及文件**：`src/components/PitchCanvas.tsx`

### ~~2. 模板橙色线在滑动视口时突然消失~~（已解决）
- **状态**：✅ 已验证，Bug3 的 forceUpdate 修复同时解决了此问题，实测无复现

### 2. ~~Native 层忽略用户设置的检测频率~~（已解决）
- **状态**：✅ 已修复
- **现象**：
  - 设置页面提供 50/100/200/400 Hz 选项
  - 但 Native 层代码写死为 50Hz，忽略了用户设置
- **原因分析**：
  - `PitchDetectorModule.mm` 第 220 行：`const double kMinSamplesBetween = sr / 50.0;`
  - 虽然 JS 层把 `pitchDetectionRate` 传下去了，但 Native 层没有使用这个参数
- **修复内容**：
  - 添加成员变量 `_detectionRate` 保存用户设置
  - 在 `startDetection` 时保存传入的 `detectionRate` 参数
  - 将 `sr / 50.0` 改为 `sr / self->_detectionRate`
- **涉及文件**：`ios/PitchPerfect/PitchDetectorModule.mm`

### 3. ~~sampleRate 字段与实际数据不符~~（已解决）
- **状态**：✅ 已删除 `sampleRate` 字段和 `PITCH_DATA_SAMPLE_RATE` 常量
- **说明**：
  - 该字段从未被实际读取使用，已从代码库中完全移除
  - 修改内容：
    - 从 `PitchData` 类型定义中删除 `sampleRate` 字段
    - 删除 `CONFIG.PITCH_DATA_SAMPLE_RATE` 常量
    - 录音和模板保存时不再写入该字段
- **涉及文件**：
  - `src/types/index.ts`
  - `src/config/constants.ts`
  - `src/services/audio.ts`
  - `src/screens/TemplatesScreen.tsx`

---

## code_fix_1（代码结构问题）

### CF1-1. PracticeScreen 过于臃肿（God Component）
- **现状**：~765 行，录音状态机、音高数据、计时器、模板选择/播放、钢琴模式切换、用户设置加载、双击检测、Modal 状态全堆在一个组件里
- **修复方向**：
  - 将录音生命周期（start/pause/resume/stop/discard/save + 计时器 + pitchData 回调）抽为 `useRecording()` 自定义 Hook
  - 将模板音频管理（startTemplateAudio / stopTemplateSound / templateSoundRef）抽为 `useTemplateAudio()` Hook
- **预期效果**：PracticeScreen 缩减到纯 UI 层，逻辑可独立测试

### CF1-2. 模板音频绕过 AudioService，形成平行音频管理路径
- **现状**：录音/历史回放走 `audioService`，模板音频在 `PracticeScreen` 里直接 `new Sound(path, '', callback)` 管理。两条路径的生命周期互相不知道，已导致 Bug #2（放弃后偶发钢琴声）
- **修复方向**：将模板音频纳入统一管理，或至少在 `discardRecording` / `saveAndStopRecording` 时确保 `audioPlayer.release()` 被调用（短期修复见 Bug #2）

### CF1-3. AudioService 混了录音和回放两个职责
- **现状**：`audio.ts` 里同时有 `startRecording/pauseRecording/stopRecording` 和 `playAudio/pausePlayback/resumePlayback/seekTo`，两个场景完全互斥但共处一类，`stopAll` 逻辑因此复杂
- **修复方向**：拆分为 `RecordingService` 和 `PlaybackService`，或至少在类内部通过命名空间清晰隔离

### CF1-4. 路径解析逻辑分散在三处
- **现状**：
  - `audio.ts` 里有 `resolveAudioPath()`
  - `storage.ts` 里有 `getRecordingPath()` / `getPitchDataPath()`
  - `nativePitchRecorder.ts` 里有 `resolveRecordingPath()`
- **修复方向**：统一收拢到 `storage.ts` 或新建 `pathUtils.ts`，单一出口

### CF1-5. `useDoubleTap` Hook 是死代码
- **现状**：`utils/doubleTap.ts` 封装了 `useDoubleTap`，但 `PracticeScreen` 自己用 `lastTapTimeRef + handleDoubleTap` 重新实现了一遍，逻辑完全一样
- **修复方向**：`PracticeScreen` 改用 `useDoubleTap`，删掉内联实现；或反过来删掉 `doubleTap.ts`，保留内联

### CF1-6. `freqToMidi` 定义了两遍
- **现状**：`utils/noteUtils.ts` 和 `components/PitchCanvas.tsx` 各有一份逻辑相同的实现
- **修复方向**：`PitchCanvas.tsx` 改为 import `noteUtils.ts` 里的版本

### CF1-7. `CONFIG` 里有一堆未使用的 YIN 算法常量
- **现状**：`config/constants.ts` 里的 `YIN_THRESHOLD / YIN_SAMPLE_RATE / YIN_BUFFER_SIZE / YIN_OVERLAP / YIN_CONFIDENCE_THRESHOLD` 在 JS 层从未被读取（YIN 算法跑在 Native）
- **修复方向**：直接删除

### ~~CF1-8. 文档与代码不符（文档需更新）~~ ✅ 已完成
- ~~`template_design.md` 中 `audioSource` 枚举为 `'import' | 'recording'`~~（已更新为 `'file' | 'exist_record' | 'deleted_record'`）
- ~~`implementation.md` 中导航结构写的是 3 个 Tab~~（已更新为 4 个 Tab）
- ~~`implementation.md` 中引用的 `RecordingPitchChart`~~（已更新为 `PlaybackPitchChart`）

---

## 性能问题

### P1. 历史播放时 currentTime state 每 100ms 触发一次全量 re-render
- **状态**：🟡 已知问题，暂不影响使用
- **现象**：播放录音时，`RecordingsScreen` 整个组件每秒重渲染 10 次
- **根本原因**：
  - `audio.ts` 的 `playAudio` 内部有 `setInterval(100ms)`，每次调用 `onProgress(seconds)`
  - `onProgress` 直接是 `(time) => setCurrentTime(time)`，每次都触发 React state 更新
  - state 更新导致 `RecordingsScreen` 整个组件树重渲染，包括进度条、按钮、列表等
- **影响范围**：`src/screens/RecordingsScreen.tsx`、`src/services/audio.ts`
- **优化方向**：用 ref 存储 `currentTime`，只在进度条和时间文字处单独订阅更新（如抽成独立子组件），避免整个 Screen 重渲染

---

## 功能迭代

### 录音界面
- [ ] 录音界面增加试听功能（暂停后可从任意位置试听已录内容）

### 设置页
- [ ] 触发音量接入：UI 可选 -50/-60/-70/-80 dB，但音频服务仍硬编码 `minVolume: -70`
- [ ] 音量过低停止检测：Toggle 已有，但录音逻辑中没有低音量检测和自动停止实现
- [x] 音高检测频率接入：UI 可选 50/100/200/400 Hz，已完全接入 Native 层实现

### 音频
- [ ] 钢琴音频延音很长，尾音听起来不自然（可考虑淡出或限制最大播放时长）

### 音高曲线
- [ ] 音高检测区域增加缩放功能（双指捏合缩放横轴时间范围 / 纵轴音高范围）
- [ ] 分享音准曲线：将音高曲线截图为图片，通过系统分享面板发送（微信 / AirDrop / 存相册等）

### 音乐理论
- [ ] 支持设置调号（Key），Y 轴音符标注和虚拟钢琴高亮按键随调号变化

### 国际化
- [ ] 多语言支持：中文 / 英文切换（界面文案、音符名称显示）

### 模板引用
- [ ] 删除录音的确认弹窗中，可展开查看具体受影响的模板名称列表（当前一期仅显示受影响数量）

---

## 微信互通

- [ ] 开发微信小程序，调用 `wx.chooseMessageFile` 接口，支持用户直接从微信聊天记录中选择音频文件，实现比「用其他应用打开」更丝滑的导入体验
  - 需要微信小程序开发者资质
  - 需要后端服务中转文件
  - 小程序与 app 之间的文件传递方案待设计

