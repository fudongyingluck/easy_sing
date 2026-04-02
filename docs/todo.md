# TODO 列表

---

## 一期

### 设置页功能

- [x] 设置页重新设计为 iOS 原生风格（分组列表 + 彩色图标行）
- [x] 录音时长限制：UI 可选 5/10/30 分钟/无限制，已接入 audioService.startRecording(durationLimit)
- [x] 音符名称显示方式：拆分为左 Y 轴和右 Y 轴两个独立配置，PitchChart 已接入（英文带八度、唱名/数字不带八度）
- [x] Y 轴双侧显示：左右两侧都显示 Y 轴标注，且左右可以独立配置显示方式（如左侧英文、右侧唱名）

### 音频问题

- [x] 钢琴点击不出声音
- [x] 录音后放弃，音频文件被正确删除
- [x] 录制时长与保存时长不一致，末尾播放无声音
- [x] 噪音比较大

### 音高检测

- [x] **性能重构：Native 音高检测 + 录音**
  - 在已有的 `PitchDetectorModule.mm`（ObjC + YIN）基础上加录音，AVAudioFile 写 WAV
  - 新增 `src/services/nativePitchRecorder.ts` JS 包装层
  - `audio.ts` 直接调用 native 模块，移除 react-native-audio-api / react-native-pitchy
  - 效果：音高检测和录音全在 native audio 线程，JS 线程零负担，无卡顿

- [x] 实现真实的音高检测（当前是模拟数据）
  - [x] 集成 react-native-audio-api 的麦克风功能
  - [x] 配置 iOS 麦克风权限（Info.plist）
  - [x] 实现音频流获取和处理
  - [x] 集成 YIN 算法进行实时音高检测
  - [x] 性能优化和真机测试

### 音高曲线

- [x] 音高曲线左右滑动还需要测试
- [x] 音高曲线的细腻程度还需要调整
- [x] 现在音高曲线更偏向连接，改成更偏向打断
- [x] 录音时红线跳跃性移动，未实时跟随当前时间
- [x] 播放历史录音时横轴突然跳到末尾

- [x] **PitchChart 组件合并 + 红线 + Seek**（`PitchChart` 与 `RecordingPitchChart` 统一）

  **组件层**
  - [x] 合并 `PitchChart` 和 `RecordingPitchChart`，统一保留 `PitchChart`
  - [x] 新增 `seekable` prop
  - [x] 新增 `onSeekChange(time: number)` prop
  - [x] `PitchCanvas` 新增 `currentTimeLine?: number` prop，画红色竖线
  - [x] 删除 `RecordingPitchChart.tsx`

  **PracticeScreen（录音暂停回看 + 试听）**
  - [x] `PitchChart` 改传 `seekable={isPaused}`、`currentTime`、`onSeekChange`
  - [x] 暂停态按钮改为：`[放弃]` `[播放 ▶]` `[继续录音 ⏺]` `[保存]`
  - [x] 「播放 ▶」从 `seekTime` 开始播放；播放中变为 `[停止 ⏹]`；试听后隐藏「继续录音」
  - [x] `saveAndStopRecording` / `discardRecording` 感知 `previewResult`，避免重复 stopRecording

  **RecordingsScreen（历史录音 seek）**
  - [x] `RecordingPitchChart` → `PitchChart`（`seekable`、`currentTime`）
  - [x] `onSeekChange` 接入 `audioService.seekTo(time)`

  **测试**
  - [x] 安装测试依赖：`npm install --save-dev @testing-library/react-native react-test-renderer@19.1.1`
  - [x] 跑 `__tests__/components/PitchChart.test.tsx` 全部 case 通过（23 个）

### 夜间模式

- [x] **第一步：数据层** — `UserSettings` 新增 `themeMode: 'light' | 'dark' | 'system'` 字段
- [x] **第二步：ThemeContext** — 新建 `src/context/ThemeContext.tsx`，提供 `useTheme()` hook
- [x] **第三步：颜色 token** — 定义 light / dark 两套颜色常量
- [x] **第四步：接入各页面/组件**
  - [x] `App.tsx`、`PracticeScreen.tsx`、`RecordingsScreen.tsx`、`SettingsScreen.tsx`、`PitchCanvas.tsx`
- [x] **第五步：设置页 UI** — 新增「外观」分组，三选一（白天 / 夜晚 / 跟随系统）

### 界面设计

- [x] 录音按钮和录音列表按钮布局设计
- [x] 虚拟钢琴折叠后按钮和音高检测区域空白过多
- [x] 钢琴下方空白过多，开始按钮压到了音高检测区域的横坐标
- [x] 播放历史记录时显示音高
- [x] 暂停后支持试听录音
- [x] 录音完成后左滑无历史记录
- [ ] 添加 App 图标
  - 设计或选择合适的 App 图标，配置 iOS Assets.xcassets

### 音乐理论

- [ ] 支持设置调号（Key），Y 轴音符标注和虚拟钢琴高亮按键随调号变化

---

## 二期

### 录音界面
- [ ] 录音界面增加试听功能（暂停后可从任意位置试听已录内容）

### 设置页
- [ ] 触发音量接入：UI 可选 -50/-60/-70/-80 dB，但音频服务仍硬编码 `minVolume: -70`（`src/services/audio.ts`）
- [ ] 音量过低停止检测：Toggle 已有，但录音逻辑中没有低音量检测和自动停止实现
- [ ] 音高检测频率接入：UI 可选 50/100/200/400 Hz，但检测逻辑中 bufferSize 仍使用固定值

### 音频
- [ ] 钢琴音频延音很长，尾音听起来不自然（可考虑淡出或限制最大播放时长）

### 音高曲线
- [ ] 音高检测区域增加缩放功能（双指捏合缩放横轴时间范围 / 纵轴音高范围）
- [ ] 分享音准曲线：将音高曲线截图为图片，通过系统分享面板发送（微信 / AirDrop / 存相册等）
