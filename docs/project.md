# iOS 项目编译和运行指南

## 环境准备

### 必需工具
- Xcode 14+
- Node.js 16+
- CocoaPods

### 检查可用模拟器
```bash
xcrun simctl list devices available
```

---

## 方式一：使用命令行（推荐）

### 1. 安装依赖
```bash
# 安装 Node.js 依赖
npm install

# 安装 iOS Pods
cd ios
pod install
cd ..
```

### 2. 编译并运行
```bash
# 直接运行（会自动启动 Metro 和模拟器）
npm run ios
```

---

## 方式二：使用 xcodebuild 命令行

### 1. 清理构建
```bash
xcodebuild -workspace ios/PitchPerfect.xcworkspace \
  -scheme PitchPerfect \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  clean
```

### 2. 编译应用
```bash
xcodebuild -workspace ios/PitchPerfect.xcworkspace \
  -scheme PitchPerfect \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```

### 3. 安装到模拟器
```bash
# 获取构建产物路径
# 通常在: ~/Library/Developer/Xcode/DerivedData/PitchPerfect-*/Build/Products/Debug-iphonesimulator/PitchPerfect.app

xcrun simctl install booted /path/to/PitchPerfect.app
```

### 4. 启动应用
```bash
xcrun simctl launch booted org.reactjs.native.example.PitchPerfect
```

---

## 方式三：使用 Xcode GUI

### 1. 打开项目
```bash
open ios/PitchPerfect.xcworkspace
```

**注意：** 务必打开 `.xcworkspace` 文件，而不是 `.xcodeproj`。

### 2. 选择模拟器
在 Xcode 顶部工具栏，选择目标模拟器（如 iPhone 17 Pro）。

### 3. 清理构建（可选）
- 菜单：Product → Clean Build Folder
- 快捷键：`Cmd + Shift + K`

### 4. 编译并运行
- 点击左上角的运行按钮（▶️）
- 或按快捷键：`Cmd + R`

---

## Metro Bundler

### 检查 Metro 是否运行
```bash
lsof -ti:8081
```

### 手动启动 Metro
```bash
npm start
```

### 重置 Metro 缓存
```bash
npm start -- --reset-cache
```

---

## 调试和日志

### 查看 Metro Bundler 日志

#### 方式一：通过浏览器访问
Metro Bundler 运行时，可以在浏览器中打开：
```
http://localhost:8081
```

#### 方式二：查看 Metro 状态
```bash
curl http://localhost:8081/status
```

#### 方式三：在启动 Metro 时查看日志
如果是手动启动的 Metro，日志会直接输出在终端中：
```bash
npm start
```

#### 方式四：重置 Metro 并查看详细日志
```bash
npm start -- --reset-cache
```

### 查看模拟器日志

#### 查看应用日志
```bash
# 查看最近 2 分钟的日志
xcrun simctl spawn booted log show --predicate 'process == "PitchPerfect"' --info --last 2m

# 实时查看日志
xcrun simctl spawn booted log stream --predicate 'process == "PitchPerfect"' --info
```

#### 查看系统日志
```bash
# 查看所有日志
xcrun simctl spawn booted log show --last 2m

# 实时监控日志
xcrun simctl spawn booted log stream
```

### 查看 Xcode 构建日志
在 Xcode 中：
- 菜单：View → Navigators → Show Report Navigator（或按 `Cmd + 9`）
- 选择最近的构建记录查看详细日志

---

## 常见问题

### 1. 模拟器已启动但应用没运行
确保 Metro bundler 正在运行，然后重新启动应用：
```bash
xcrun simctl launch booted org.reactjs.native.example.PitchPerfect
```

### 2. CocoaPods 安装失败
```bash
cd ios
rm -rf Pods Podfile.lock
pod install
```

### 3. 构建失败，尝试清理后重新构建
```bash
cd ios
xcodebuild clean
rm -rf ~/Library/Developer/Xcode/DerivedData
pod install
```

### 4. 查看可用的模拟器
```bash
xcrun simctl list devices available
```

---

## 依赖包升级说明

### 检查包版本
```bash
# 检查单个包
npm show <package-name> version

# 检查所有过期包
npm outdated
```

### 升级依赖
1. 更新 `package.json` 中的版本号
2. 重新安装：
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   cd ios
   rm -rf Pods Podfile.lock
   pod install
   ```

### 注意 Breaking Changes
- React Navigation v6 → v7：`Stack.Screen` 的 `component` prop 需要改为 render callback 方式
  ```tsx
  // v6
  <Stack.Screen name="Main" component={MainScreen} />

  // v7
  <Stack.Screen name="Main">{(props) => <MainScreen {...props} />}</Stack.Screen>
  ```

---

## 项目结构
```
pitch_perfect/
├── src/              # 源代码
├── ios/              # iOS 原生代码
├── android/          # Android 原生代码
├── docs/             # 文档
├── package.json      # 依赖配置
└── README.md         # 项目说明
```
