# 开发指南

## 环境准备

### 必需工具
- Xcode 14+
- Node.js 16+
- CocoaPods

### 安装依赖
```bash
npm install
cd ios && pod install && cd ..
```

### 检查可用模拟器
```bash
xcrun simctl list devices available
```

---

## 编译与运行

### 方式一：React Native CLI（日常开发推荐）

```bash
npm run ios
```

可选参数：
```bash
npm run ios -- --simulator="iPhone 17 Pro"
npm run ios -- --device="My iPhone"
npm run ios -- --no-packager   # Metro 已在跑时加此参数
```

### 方式二：Xcode GUI

```bash
open ios/EasySing.xcworkspace
```

注意：务必打开 `.xcworkspace`，不要打开 `.xcodeproj`。

- 编译运行：`Cmd + R`
- 清理构建：`Cmd + Shift + K`
- 查看构建日志：`Cmd + 9`（Report Navigator）

### 方式三：xcodebuild 命令行（CI/CD）

```bash
# 清理
xcodebuild -workspace ios/EasySing.xcworkspace \
  -scheme EasySing -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' clean

# 编译
xcodebuild -workspace ios/EasySing.xcworkspace \
  -scheme EasySing -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build

# Release 构建
xcodebuild -workspace ios/EasySing.xcworkspace \
  -scheme EasySing -sdk iphoneos \
  -configuration Release -destination 'generic/platform=iOS' clean build
```

### 三种方式对比

| 特性 | Xcode GUI | xcodebuild | npm run ios |
|------|-----------|------------|-------------|
| 图形界面 / 断点调试 | ✅ | ❌ | ❌ |
| 详细构建日志 | ✅ | ✅ | 有限 |
| 适合 CI/CD | ❌ | ✅ | 可选 |
| 日常开发便利性 | 中等 | 较低 | ✅ 简单 |

---

## Metro Bundler

```bash
npm start                        # 启动
npm start -- --reset-cache       # 重置缓存启动
lsof -ti :8081 | xargs kill -9   # 端口占用时强制释放
```

---

## 真机运行与日志

### 安装并运行到真机

```bash
npx react-native start
# 另开终端：
npx react-native run-ios --device --no-packager
```

### 查看 JS 日志

Metro 终端直接打印 `console.log`。过滤特定模块：
```bash
npx react-native start 2>&1 | grep -E "\[RealAudio\]|\[YIN\]|\[AudioService\]"
```

### 查看原生 NSLog

```bash
open -a Console   # 左侧选中手机设备，搜索过滤 EasySing
```

### 查看原生崩溃日志

```bash
ls ~/Library/Logs/DiagnosticReports/ | grep EasySing
```

### 查看模拟器日志

```bash
# 最近 2 分钟
xcrun simctl spawn booted log show --predicate 'process == "EasySing"' --info --last 2m

# 实时
xcrun simctl spawn booted log stream --predicate 'process == "EasySing"' --info
```

---

## 常见问题

### CocoaPods 安装失败
```bash
cd ios && rm -rf Pods Podfile.lock && pod install
```

### 构建失败（彻底清理）
```bash
cd ios && xcodebuild clean
rm -rf ~/Library/Developer/Xcode/DerivedData
pod install
```

### 证书过期（免费账号 7 天后）
用 Xcode 打开 `ios/EasySing.xcworkspace` 重新签名。

### 依赖升级后重新编译
```bash
rm -rf node_modules package-lock.json && npm install
cd ios && rm -rf Pods Podfile.lock && pod install
```
