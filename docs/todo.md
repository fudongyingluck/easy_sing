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

### 阶段三：补关键单测（重构前的安全网）
在动核心逻辑之前，先给以下模块补测试：
- `noteUtils.ts`：freqToMidi / midiToNoteName / noteNameToMidi / getCentsDeviation（纯函数，最好写）
- `AudioService`：startRecording / pauseRecording / resumeRecording / stopRecording 的状态流转
- `PracticeScreen` 录音状态机：idle → recording → paused → idle 的关键路径

### 阶段四：中风险重构（有测试保护后再做）
- **CF1-4**：统一路径解析逻辑到单一出口
- **CF1-3**：AudioService 录音/回放职责拆分（或命名空间隔离）

### 阶段五：高风险重构（最后做）
- **CF1-1**：PracticeScreen 拆分 `useRecording` / `useTemplateAudio` Hook
- **CF1-2**：模板音频纳入统一音频管理路径

---

## Bug 列表

### 0. 录音中音高曲线和音频周期性掉段（待定位）
- **状态**：🔍 原因未确认，待复现验证
- **现象**：
  - 录音过程中，音高曲线和声音会周期性消失一小段（约几百毫秒），然后恢复，反复发生
- **关键判别证据（新增）**：
  - ✅ **无模板时不掉帧**，有模板时掉帧 → 掉帧与模板播放强相关
  - 模板音频通过**有线耳机**播放，不是扬声器 → 排除 AEC 回声消除模板音频的可能（麦克风拾不到耳机内的声音）
  - → 原因 1（`setVoiceProcessingEnabled:YES` 把唱歌音当噪声压制）仍有可能，但需重新评估：AUVoiceIO 在有音频输出时是否行为不同？
  - → **新增最可能原因**：模板开始播放时 `react-native-sound` 内部重置 AVAudioSession category 为 `.playback`，与录音所需的 `.playAndRecord` 冲突，导致周期性中断
- **可能原因（按可能性排序，已修订）**：
  1. **Audio Session 冲突（新，最可能）**：`startTemplateAudio` 启动 react-native-sound 时，Sound 对象可能将 AVAudioSession 切回 `.playback` category，破坏录音 session，周期性触发 engine 中断
  2. **`setVoiceProcessingEnabled:YES`**：AUVoiceIO 在同时有音频输出时可能触发更激进的噪声抑制，把人声当噪声压制
  3. **AVAudioEngine 路由变化后无恢复机制**：代码未监听 `AVAudioEngineConfigurationChangeNotification`，耳机插拔/路由变化时 engine 暂停后无法重启
  4. **滑窗 buffer size 问题**：路由变化瞬间 iOS 可能下发小 buffer（< kWindow=2048 frames），导致滑窗条件 `offset + kWindow <= frames` 不成立，整段无分析
- **验证方法**：
  - 掉段后回放那段录音——若那段是**真静音**则 session 被中断（原因 1/2）；若声音完整但曲线空白则原因 3/4
  - 在 `startTemplateAudio` 前后打印 `AVAudioSession.sharedInstance().category`，确认是否被改变
- **涉及文件**：
  - `ios/PitchPerfect/PitchDetectorModule.mm`（第 163-167 行 voice processing、第 228 行滑窗条件）
  - `src/hooks/useTemplateAudio.ts`（`startTemplateAudio` 函数）

### ~~1. 播放历史录音/模板时红线闪动 + 音高曲线消失~~（已解决）
- **状态**：✅ 已修复（测试验证）
- **现象**：
  - 播放历史录音或模板时，红线（当前时间指示线）以 100ms 频率闪动
  - 播放过程中音高曲线会短暂消失
- **根本原因**：`PlaybackPitchChart` 中 `currentTime` 和 `viewportStart` 更新时序不一致导致的"撕裂"（tearing）：
  - `currentTime` 由 100ms 定时器直接 `setCurrentTime(t)` → 立即触发 re-render
  - `viewportStart` 由 `viewportAnim.setValue()` 驱动，但更新路径是 `useEffect([currentTime])` → 动画 listener → `setViewportStart()`，比 `currentTime` 晚一帧
  - 每次 `currentTime` 更新，都有一帧 `viewportStart` 是旧值，红线位置用两者之差计算，导致每 100ms 闪一次
  - 同理，这一帧旧的 `viewportStart/viewportEnd` 传给 `PitchCanvas`，可能导致 `bisectLeft/bisectRight` 切出空区间，曲线短暂消失
- **修复思路**：在同一帧内同步更新 `currentTime` 和 `viewportStart`，或改用 ref 直接驱动红线位置（不走 React state），避免异步 useEffect 带来的时序差
- **涉及文件**：`src/components/PlaybackPitchChart.tsx`

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

### 2. 偶发：点击「放弃」后出现钢琴声（待定位）
- **状态**：🐛 偶发，未找到稳定复现路径
- **现象**：
  - 点击「放弃」停止录音后，会听到钢琴音播放出来
- **可能原因**：`discardRecording` 调用了 `audioPlayer.stopAll()` 和 `audioService.stopPlayback()`，但没有调用 `audioPlayer.release()`；若此时有残留的 Sound 对象（钢琴音或模板音），iOS 可能在 session 重置后恢复播放。可对比 `activatePlaybackSession` 的逻辑——它强制 `release()` 再激活 session。
- **涉及文件**：`src/screens/PracticeScreen.tsx`（`discardRecording` 函数）

### 3. ~~模板橙色线加载后部分不显示~~（已解决）
- **状态**：✅ 已修复
- **现象**：
  - 选择模板后，视口内应显示的橙色模板线只有部分出现（如 3 条中只显示 1 条）
  - 点击"开始"录音后，缺失的线才突然出现
- **根本原因**：react-native-svg 的 native 层 bug：当 `<G>` 内部从 **0 个 Path** 首次增加到 **N 个 Path** 时，部分 Path 不渲染。等到下次任意 re-render 才补全。通过在模板加载后添加 debug overlay 确认：`tmpl:3`（3 条路径已计算），但视觉上只显示 1 条。
- **修复方案**：在 `PitchCanvas` 内部添加 `useEffect`，当 `templateData` 变化（从无到有）后，触发一次额外的 `forceUpdate`，使 react-native-svg 补全渲染。
- **涉及文件**：`src/components/PitchCanvas.tsx`

### 2. 模板橙色线在滑动视口时突然消失（同上，待验证是否已被修复）
- **现象**：
  - 在 [3,9] 视口内，可以看到三根橙色模板线：[3, 4.5]、[5.7, 7.2]、[8, -]
  - 滑动到 [5,11] 视口时，[8, 9.4] 这条线突然消失
  - 新出现了 [10.3, -] 这条线
- **原因分析**：与 Bug 1 同根因，react-native-svg 在新增 Path 时的渲染缺失问题
- **涉及文件**：`src/components/PitchCanvas.tsx`

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

