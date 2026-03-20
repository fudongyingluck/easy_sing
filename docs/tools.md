# iOS 编译工具详解

## 编译方式概述

iOS React Native 项目有多种编译方式，每种方式适用于不同的场景。

---

## 方式一：Xcode GUI（图形界面）

### 适用场景
- 日常开发和调试
- 需要查看详细的构建日志
- 需要调试原生代码
- 需要设置断点和查看变量

### 使用步骤

1. **打开项目**
   ```bash
   open ios/PitchPerfect.xcworkspace
   ```
   > 注意：始终打开 `.xcworkspace`，不要打开 `.xcodeproj`

2. **选择目标设备**
   - 在 Xcode 顶部工具栏，点击设备选择器
   - 选择模拟器（如 iPhone 17 Pro）或连接的真机

3. **配置 Scheme（可选）**
   - 菜单：Product → Scheme → Edit Scheme（或 `Cmd + <`）
   - 可以配置 Debug/Release 模式、环境变量等

4. **清理构建（推荐）**
   - 菜单：Product → Clean Build Folder
   - 快捷键：`Cmd + Shift + K`
   - 用于解决缓存导致的构建问题

5. **构建并运行**
   - 点击左上角的运行按钮（▶️）
   - 或按快捷键：`Cmd + R`
   - Xcode 会：
     - 编译原生代码
     - 启动 Metro Bundler（如果需要）
     - 安装应用到模拟器/真机
     - 启动应用

### 查看构建日志
- 菜单：View → Navigators → Show Report Navigator（或 `Cmd + 9`）
- 选择最近的构建记录
- 可以看到每个步骤的详细输出和错误信息

### 调试功能
- 设置断点：点击代码行号左侧
- 查看变量：在调试控制台输入 `po 变量名`
- 查看线程：在 Debug Navigator 中查看所有线程状态

---

## 方式二：xcodebuild 命令行

### 适用场景
- CI/CD 自动化构建
- 脚本化构建流程
- 不需要图形界面的环境
- 快速验证构建是否成功

### 基本语法

```bash
xcodebuild -workspace <workspace> \
  -scheme <scheme> \
  -sdk <sdk> \
  -destination <destination> \
  [action]
```

### 常用参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `-workspace` | 指定 `.xcworkspace` 文件 | `ios/PitchPerfect.xcworkspace` |
| `-scheme` | 指定构建 scheme | `PitchPerfect` |
| `-sdk` | 指定 SDK | `iphonesimulator` 或 `iphoneos` |
| `-destination` | 指定目标设备 | `platform=iOS Simulator,name=iPhone 17 Pro` |
| `-configuration` | 配置类型 | `Debug` 或 `Release` |

### 常用命令

#### 1. 清理构建
```bash
xcodebuild -workspace ios/PitchPerfect.xcworkspace \
  -scheme PitchPerfect \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  clean
```

#### 2. 仅构建（不运行）
```bash
xcodebuild -workspace ios/PitchPerfect.xcworkspace \
  -scheme PitchPerfect \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```

#### 3. 清理并构建
```bash
xcodebuild -workspace ios/PitchPerfect.xcworkspace \
  -scheme PitchPerfect \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  clean build
```

#### 4. Release 构建
```bash
xcodebuild -workspace ios/PitchPerfect.xcworkspace \
  -scheme PitchPerfect \
  -sdk iphoneos \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  clean build
```

### 查看可用的模拟器
```bash
xcrun simctl list devices available
```

### 查找构建产物
构建成功后，应用通常在：
```
~/Library/Developer/Xcode/DerivedData/PitchPerfect-*/Build/Products/Debug-iphonesimulator/PitchPerfect.app
```

### 安装到模拟器
```bash
xcrun simctl install booted /path/to/PitchPerfect.app
```

### 启动应用
```bash
xcrun simctl launch booted org.reactjs.native.example.PitchPerfect
```

---

## 方式三：React Native CLI（npm run ios）

### 适用场景
- 快速开发和测试
- 不需要处理原生代码细节
- React Native 标准开发流程

### 使用方法

```bash
npm run ios
```

这个命令会：
1. 检查并启动 Metro Bundler
2. 调用 xcodebuild 构建应用
3. 安装到模拟器
4. 启动应用

### 可选参数

```bash
# 指定模拟器
npm run ios -- --simulator="iPhone 17 Pro"

# 指定设备
npm run ios -- --device="My iPhone"

# 不启动 Metro
npm run ios -- --no-packager
```

---

## 三种方式对比

| 特性 | Xcode GUI | xcodebuild | npm run ios |
|------|-----------|------------|-------------|
| 图形界面 | ✅ | ❌ | ❌ |
| 调试功能 | ✅ | ❌ | ❌ |
| 详细日志 | ✅ | ✅ | 有限 |
| 适合 CI/CD | ❌ | ✅ | 可选 |
| 学习曲线 | 中等 | 较高 | 简单 |
| 自动化 | 手动 | ✅ | ✅ |
| 原生代码调试 | ✅ | ❌ | ❌ |

---

## 推荐工作流

### 日常开发
1. 使用 `npm run ios` 快速启动
2. 遇到问题时，打开 Xcode GUI 查看详细日志
3. 需要调试原生代码时，使用 Xcode GUI

### 构建发布
1. 使用 xcodebuild 进行 Release 构建
2. 集成到 CI/CD 流程

### 调试问题
1. 先用 `npm run ios` 看基本错误
2. 问题复杂时，用 Xcode GUI 查看完整构建日志
3. 使用模拟器日志和 Metro 日志配合排查

---

## 常见问题

### 1. Xcode 构建失败但命令行成功
- 检查 Xcode 的 Scheme 配置
- 清理 Xcode 缓存：`rm -rf ~/Library/Developer/Xcode/DerivedData`

### 2. xcodebuild 找不到 simulator
- 确保模拟器名称正确：`xcrun simctl list devices available`
- 使用单引号包裹 destination 参数

### 3. 构建缓存问题
- 始终在重新构建前清理：`xcodebuild clean` 或 Xcode 的 Clean Build Folder
- Metro 缓存：`npm start -- --reset-cache`
