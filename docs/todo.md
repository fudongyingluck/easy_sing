# TODO 列表

## 音乐理论

- [ ] 支持设置调号（Key），Y 轴音符标注和虚拟钢琴高亮按键随调号变化

## 设置页功能

- [x] 设置页重新设计为 iOS 原生风格（分组列表 + 彩色图标行）
- [x] 录音时长限制：UI 可选 5/10/30 分钟/无限制，已接入 audioService.startRecording(durationLimit)
- [x] 音符名称显示方式：拆分为左 Y 轴和右 Y 轴两个独立配置，PitchChart 已接入（英文带八度、唱名/数字不带八度）
- [x] Y 轴双侧显示：左右两侧都显示 Y 轴标注，且左右可以独立配置显示方式（如左侧英文、右侧唱名）

## 待测试

- [ ] 录音后放弃，验证音频文件是否被正确删除（storage.ts `deleteRecordingFiles` 只删了 AsyncStorage key，未调用文件系统删除音频文件）

## 音频问题

- [x] 钢琴点击不出声音
  - 问题描述：在练习页面点击虚拟钢琴键盘，没有声音播放

- [ ] 录制时长与保存时长不一致，末尾播放无声音
  - 现象：录制显示 12s，保存后变成 16s，最后几秒播放无声音
  - 可能原因：stopRecording 时 AVAudioFile 还有未写入的缓冲帧，或计时逻辑（JS 侧）与实际 WAV 写入时长不同步

## 音高检测

- [x] **性能重构：Native 音高检测 + 录音**
  - 在已有的 `PitchDetectorModule.mm`（ObjC + YIN）基础上加录音，AVAudioFile 写 WAV
  - 新增 `src/services/nativePitchRecorder.ts` JS 包装层
  - `audio.ts` 直接调用 native 模块，移除 react-native-audio-api / react-native-pitchy
  - 效果：音高检测和录音全在 native audio 线程，JS 线程零负担，无卡顿

- [x] 实现真实的音高检测（当前是模拟数据）
  - 问题描述：点击开始录音后，显示的是固定的模拟音高数据（C4 附近波动），不是真实的麦克风音高检测
  - 需要完成的工作：
    - [x] 集成 react-native-audio-api 的麦克风功能
    - [x] 配置 iOS 麦克风权限（Info.plist）
    - [x] 实现音频流获取和处理
    - [x] 集成 YIN 算法进行实时音高检测
    - [x] 性能优化和真机测试
  - 依赖：
    - react-native-audio-api 库
    - YIN 算法（已在 src/utils/yin.ts）
    - 真机测试（麦克风权限）
  - 进展：
    - 2026-03-23: 已完成代码实现，使用 AnalyserNode 获取音频数据，YIN 算法检测音高
    - 2026-03-23: 真机环境已搭好，正在真机测试中

## 音高曲线

- [x] 音高曲线左右滑动还需要测试
- [x] 音高曲线的细腻程度还需要调整
- [x] 现在音高曲线更偏向连接，改成更偏向打断

## 二期功能

### 设置页
- [ ] 触发音量接入：UI 可选 -50/-60/-70/-80 dB，但音频服务仍硬编码 `minVolume: -70`（`src/services/audio.ts`）
- [ ] 音量过低停止检测：Toggle 已有，但录音逻辑中没有低音量检测和自动停止实现
- [ ] 音高检测频率接入：UI 可选 50/100/200/400 Hz，但检测逻辑中 bufferSize 仍使用固定值

### 界面设计
- [ ] 历史记录播放页面：音高区域和横轴相距过远，需要重新设计布局

### 音频
- [ ] 钢琴音频延音很长，尾音听起来不自然（可考虑淡出或限制最大播放时长）

### 音高曲线

- [ ] 录音时红线跳跃性移动，未实时跟随当前时间（`currentTime` 由 JS 计时器每秒 +1，与音频实际进度不同步）
- [x] 播放历史录音时横轴突然跳到末尾（`now` 误用了 `dataLatestTime`，改为 seekable+playing 时只跟 `currentTime`）
- [ ] 音高检测区域增加缩放功能（双指捏合缩放横轴时间范围 / 纵轴音高范围）

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

## 界面设计

- [x] 录音按钮和录音列表按钮布局设计
  - 设计方案：
    - 状态1（空闲）：显示 [开始] 按钮
    - 状态2（录音中）：显示 [暂停] 按钮
    - 状态3（已暂停）：显示 [继续] [保存] [放弃] 三个按钮（同一行）
    - 保存后回到状态1，显示 [开始]（不再有独立的"已保存"状态）

- [x] 虚拟钢琴折叠后按钮和音高检测区域空白过多
  - 问题描述：虚拟钢琴折叠收起后，底部控制按钮和音高检测区域之间有大量空白，界面不够紧凑
  - 期望效果：
    - 空白的区域要用音高检测区域填补
    - 按钮不应该跟着钢琴移动，应该跟着音高检测区域移动
  - 可能方案：
    - 调整布局结构，让音高检测区域占据更多空间
    - 钢琴折叠时，重新分配各元素的空间
    - 使用 flex 布局让元素更合理地分配空间

- [ ] 添加 App 图标
  - 问题描述：当前 App 没有自定义图标，使用的是默认图标
  - 需要完成的工作：
    - 设计或选择合适的 App 图标
    - 配置 iOS 的 App 图标（Assets.xcassets）
    - 配置 Android 的 App 图标

- [x] 播放历史记录时显示音高
- [x] 暂停后支持试听录音（在保存/放弃前可以先试听刚录的内容）→ 见「PitchChart 组件合并」

- [x] 钢琴下方空白过多，开始按钮压到了音高检测区域的横坐标
  - 问题描述：虚拟钢琴区域下方有多余空白，"开始"等控制按钮位置偏低，遮挡了音高检测图表的横坐标轴

- [x] 录音完成后左滑无历史记录
  - 问题描述：完成音高检测录音后，从主页左滑进入历史记录页面，没有显示刚录制的记录
  - 可能原因：
    - 保存录音后未触发历史列表刷新
    - 左滑导航与录音保存的状态同步问题

