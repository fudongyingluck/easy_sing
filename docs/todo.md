# 待办事项（未来版本）

---

## Bug 列表

### 1. 模板橙色线在滑动视口时突然消失
- **现象**：
  - 在 [3,9] 视口内，可以看到三根橙色模板线：[3, 4.5]、[5.7, 7.2]、[8, -]
  - 滑动到 [5,11] 视口时，[8, 9.4] 这条线突然消失
  - 新出现了 [10.3, -] 这条线
- **原因分析**：
  - 模板曲线只查找了 leftAnchor（视口左侧最后一个有效点），没有查找 rightAnchor（视口右侧第一个有效点）
  - 当线段跨越视口边界时，缺少右侧锚点保持连续性
  - 超出 midi 范围时的处理逻辑会中断线段
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

---

## 微信互通

- [ ] 开发微信小程序，调用 `wx.chooseMessageFile` 接口，支持用户直接从微信聊天记录中选择音频文件，实现比「用其他应用打开」更丝滑的导入体验
  - 需要微信小程序开发者资质
  - 需要后端服务中转文件
  - 小程序与 app 之间的文件传递方案待设计

