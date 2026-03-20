# 实时音准练习 - iOS APP

## 📋 项目说明

这是一个帮助声乐练习者的实时音高检测APP，支持iOS平台。

## 🔧 环境要求

- Mac 电脑（macOS 12+）
- Xcode 14+
- Node.js 16+
- CocoaPods

## 🚀 初始化步骤

### 1. 安装依赖

```bash
# 安装 Node.js 依赖
npm install

# 安装 iOS Pods
cd ios
pod install
cd ..
```

### 2. 运行项目

```bash
# 启动 Metro bundler
npm start

# 在新终端运行 iOS 模拟器
npm run ios
```

### 3. 在真机上运行

1. 用 Xcode 打开 `ios/PitchPerfect.xcworkspace`
2. 在 Xcode 中选择你的 iPhone 设备
3. 点击运行按钮

## 📁 项目结构

```
music_small_app/
├── src/
│   ├── config/          # 配置
│   │   └── constants.ts  # 全局常量
│   ├── types/           # 类型定义
│   │   └── index.ts
│   ├── utils/           # 工具函数
│   │   ├── noteUtils.ts  # 音符工具
│   │   └── doubleTap.ts # 双击检测
│   ├── services/        # 服务层
│   │   ├── storage.ts    # 存储服务
│   │   └── audio.ts      # 音频服务
│   ├── components/      # 组件
│   │   ├── Piano.tsx    # 虚拟钢琴
│   │   └── PitchChart.tsx # 音高曲线
│   └── screens/         # 页面
│       ├── MainScreen.tsx # 主界面
│       └── RecordingsScreen.tsx # 录音列表
├── ios/                # iOS原生代码
├── package.json
└── README.md
```

## ⚠️ 注意事项

1. **音高检测算法** - 目前是占位符，需要集成 YIN 算法
2. **钢琴音效** - 需要添加音频播放
3. **真机测试** - 需要 Apple 开发者账号（免费账号也可以，7天有效期）

## 🎯 核心功能

- ✅ 三种预设音域模式（男声/女声/吉他/小提琴）
- ✅ 自定义音域模式
- ✅ 录音/钢琴模式切换（双击）
- ✅ 实时音高曲线显示
- ✅ 虚拟钢琴
- ✅ 录音功能
- ✅ 录音列表管理
- ✅ 分享录音给老师

---

**文档版本**：v1.0
**创建日期**：2024-01-15
