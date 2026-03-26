# 实时音准练习 - iOS APP 设计文档

## 文档说明
本文档基于 [设计文档-公共部分.md](./设计文档-公共部分.md)，包含iOS APP特有的设计内容。

---

## 技术架构

### 框架选择：React Native

**选择理由**：
- 生态最成熟，第三方库最多
- 性能接近原生
- 社区活跃，问题容易解决
- 有使用经验

### 目录结构（以React Native为例）

```
pitch_perfect/
├── src/
│   ├── components/         # 通用组件
│   │   ├── Piano.tsx       # 虚拟钢琴组件
│   │   └── PitchChart.tsx  # 音高曲线图组件
│   ├── screens/            # 页面
│   │   ├── PracticeScreen.tsx  # 主练习界面
│   │   ├── RecordingsScreen.tsx # 录音列表
│   │   └── SettingsScreen.tsx  # 设置页面
│   ├── services/           # 服务层
│   │   ├── audio.ts        # 音频处理服务（含音高检测）
│   │   └── storage.ts      # 存储服务（AsyncStorage）
│   ├── utils/              # 工具类
│   │   ├── noteUtils.ts    # 音符工具
│   │   ├── audioUtils.ts   # 音频播放工具
│   │   └── yin.ts          # YIN 音高检测算法
│   ├── config/
│   │   └── constants.ts    # 全局配置常量
│   ├── types/
│   │   └── index.ts        # TypeScript 类型定义
│   └── App.tsx             # 应用入口
├── ios/                    # iOS原生代码
└── package.json
```

---

## 数据存储

### 本地存储内容

#### 1. 用户设置 (AsyncStorage)
```javascript
{
  currentModeId: 'female',    // 预设或自定义模式的 id
  customModes: [              // 用户自定义的模式列表
    { id: 'custom_1', name: '我的高音区', startNote: 'C4', endNote: 'C6' }
  ],
  lastUpdated: '2024-01-15T14:30:00.000Z',
  pitchDetectionRate: 100,    // 50 | 100 | 200 | 400 Hz（当前未接入检测逻辑）
  triggerVolume: -70,         // 触发音量 dB（当前未接入检测逻辑）
  recordingDurationLimit: 600, // 录音时长限制（秒），0 = 无限制
  autoStopOnLowVolume: false,  // 音量过低停止检测（当前未实现）
  leftYAxisDisplay: 'english', // 'english' | 'solfege' | 'number'
  rightYAxisDisplay: 'english'
}
```

#### 2. 录音列表 (AsyncStorage)
```javascript
[
  {
    id: 'rec_20240115_143022',
    name: '2024-01-15 14:30:22',
    audioFilePath: 'Documents/recordings/rec_20240115_143022.mp3',
    pitchDataPath: 'Documents/recordings/rec_20240115_143022_pitch.json',
    duration: 155,           // 秒
    fileSize: 1024000,       // 字节
    createTime: '2024-01-15T14:30:22.000Z'
  }
]
```

### 文件存储位置
- 录音文件：`Documents/recordings/`
- 音高数据：`Documents/recordings/`
- 用户可以在"文件"App中访问这些文件

---

## iOS特有功能

### 1. 录音分享功能

#### 系统分享面板
```javascript
// iOS系统分享
import { Share } from 'react-native'

async function shareRecording(filePath) {
  try {
    const result = await Share.share({
      url: filePath,
      title: '我的录音',
      message: '分享一个录音'
    })
  } catch (error) {
    console.log(error)
  }
}
```

#### 录音列表界面
```
┌──────────────────────────────────────────┐
│ 📂 我的录音  [ ◀ 返回 ]                  │
├──────────────────────────────────────────┤
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ 🎵 2024-01-15 14:30                │ │
│  │    时长: 02:35                      │ │
│  │ [ ▶️ 播放 ] [ 📤 分享 ] [ 🗑️ 删除 ]  │ │
│  └─────────────────────────────────────┘ │
│                                          │
│ 存储空间: 3.2GB / 128GB                 │
│                                          │
└──────────────────────────────────────────┘
```

---

## 主界面设计

### 录音按钮状态设计

主界面底部只有一个控制区域，根据录音状态显示不同按钮。

#### 状态1：空闲（Idle）
- 显示单个按钮：`[ 开始 ]`
- 点击开始录音

#### 状态2：录音中（Recording）
- 显示单个按钮：`[ 暂停 ]`
- 点击暂停录音

#### 状态3：已暂停（Paused）
- 显示三个按钮（同一行）：`[>] [S] [X]`
- 按钮文字：继续、保存、放弃
- **继续**：回到录音状态
- **保存**：保存录音，回到空闲状态
- **放弃**：丢弃录音，回到空闲状态

#### 状态流转图
```
空闲 → 点击开始 → 录音中
录音中 → 点击暂停 → 已暂停
录音中 → 达到时长上限 → 自动暂停（仅显示保存/放弃）
已暂停 → 点击继续 → 录音中
已暂停 → 点击保存 → 保存录音 → 空闲
已暂停 → 点击放弃 → 丢弃录音 → 空闲
```

*注：已移除"已保存（Stopped）"状态，保存/放弃后直接回到空闲，不再有"重新"按钮。*

#### 录音列表按钮
- 录音列表功能暂时从主界面移除
- 待后续设计确认后再考虑添加位置

---

## 开发者账号说明

### 免费账号（Apple ID）
- ✅ 可以在模拟器上运行
- ✅ 可以侧载到自己的iPhone
- ⚠️ 7天后需要重新签名
- ❌ 无法发布到App Store
- ❌ 无法使用TestFlight

### 付费开发者账号（$99/年）
- ✅ 可以永久安装到自己的iPhone
- ✅ 可以发布到App Store
- ✅ 可以用TestFlight邀请最多10000人测试
- ✅ 可以使用推送通知、iCloud等高级功能

---

## 开发计划

### 第一阶段：基础框架
- [x] 选择跨平台框架（React Native）
- [x] 创建项目结构
- [x] 搭建基础页面框架
- [x] 实现页面导航（底部 Tab 导航：练习/录音/设置）

### 第二阶段：音频核心
- [x] 集成音频处理库（react-native-pitchy）
- [x] 实现 YIN 音高检测算法（src/utils/yin.ts）
- [x] 实现实时音频处理（AudioService + Pitchy）
- [x] 实现钢琴音效生成（audioUtils + 正弦波）

### 第三阶段：UI 界面
- [x] 实现主界面布局
- [x] 实现音高显示和曲线图（PitchChart，支持上下滑动、左右拖拽）
- [x] 实现录音模式 / 钢琴模式切换
- [x] 实现双击检测（双击钢琴区域切换模式）

### 第四阶段：虚拟钢琴
- [x] 实现钢琴组件（Piano.tsx）
- [x] 实现钢琴点击发音
- [x] 实现钢琴左右滑动和滑块同步

### 第五阶段：录音功能
- [x] 实现录音功能（开始/暂停/继续/保存/放弃）
- [x] 实现录音列表管理（RecordingsScreen）
- [ ] 实现录音试听（历史录音播放暂无声音）
- [ ] 实现系统分享功能

### 第六阶段：优化与测试
- [x] 真机测试（iOS，已在设备上验证）
- [ ] 性能优化
- [ ] 兼容性测试（不同iOS版本）
- [ ] 配置开发者账号（如需要）

---

## 推荐开发路径

### 路径A：先做小程序验证
1. 先做微信小程序，验证核心功能
2. 验证成功后，用Taro/Uni-app迁移到iOS APP
3. 加上分享功能

### 路径B：直接做iOS APP
1. 选择跨平台框架
2. 直接开发iOS APP
3. 同时实现所有功能

---

**文档版本**：v1.0
**创建日期**：2024-01-15
**最后更新**：2024-01-15
