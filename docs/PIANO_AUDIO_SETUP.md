# 钢琴音频设置指南

## 概述

本项目使用预录制的钢琴音频文件来提供真实的钢琴音色。

## 快速开始

### 1. 获取钢琴音频文件

#### 选项 A：使用免费开源采样（推荐）

**推荐资源：**

1. **University of Iowa Piano Samples**（免费，高质量）
   - 下载地址：https://theremin.music.uiowa.edu/MISpiano.html
   - 格式：WAV
   - 需要转换为 AAC 256kbps

2. **Piano Key Sounds**（GitHub 免费资源）
   - 搜索 "piano sample pack github"
   - 很多开源项目提供预转换的音频

3. **使用音乐制作软件生成**
   - 使用 GarageBand、FL Studio 等
   - 导出每个音符为独立文件

#### 选项 B：使用简化测试集

为了快速测试，可以只准备几个常用音符：
- C4, D4, E4, F4, G4, A4, B4, C5

### 2. 准备音频文件

#### 文件命名规范

```
C4.m4a   (中央C)
Cs4.m4a  (C#4 - 注意用 s 代替 #)
D4.m4a
Ds4.m4a
E4.m4a
F4.m4a
Fs4.m4a
G4.m4a
Gs4.m4a
A4.m4a
As4.m4a
B4.m4a
C5.m4a
...
```

#### 音高参考（常用区域）

| 音符 | 频率 | 说明 |
|------|------|------|
| C3 | 130.81 Hz | 男声低音区开始 |
| C4 | 261.63 Hz | 中央C |
| C5 | 523.25 Hz | 女声高音区 |
| C6 | 1046.50 Hz | 最高音 |

#### 格式转换

使用 FFmpeg 转换为 AAC 256kbps：

```bash
# 单文件转换
ffmpeg -i C4.wav -c:a aac -b:a 256k C4.m4a

# 批量转换（macOS/Linux）
for file in *.wav; do
  ffmpeg -i "$file" -c:a aac -b:a 256k "${file%.wav}.m4a"
done

# 批量替换 # 为 s
for file in *#*.m4a; do
  mv "$file" "${file/#/s}"
done
```

### 3. 添加到 iOS 项目

#### 步骤：

1. 打开 Xcode 项目：
   ```bash
   cd ios
   open PitchPerfect.xcworkspace
   ```

2. 在 Xcode 中：
   - 在左侧导航器右键点击项目名
   - 选择 "Add Files to PitchPerfect..."
   - 选择所有 .m4a 文件
   - ✅ 勾选 "Copy items if needed"
   - ✅ 勾选 "Add to target: PitchPerfect"
   - 点击 "Add"

3. 验证：
   - 在 Xcode 左侧导航器中能看到音频文件
   - 点击文件，在右侧检查 "Target Membership" 中 PitchPerfect 已勾选

### 4. 添加到 Android 项目

#### 步骤：

1. 创建资源目录：
   ```bash
   mkdir -p android/app/src/main/res/raw
   ```

2. 复制音频文件：
   ```bash
   cp *.m4a android/app/src/main/res/raw/
   ```

3. 重命名文件（Android 限制）：
   - 文件名只能包含小写字母、数字和下划线
   - `C4.m4a` → `c4.m4a`
   - `Cs4.m4a` → `cs4.m4a`

   ```bash
   # 批量重命名
   cd android/app/src/main/res/raw
   for file in *.m4a; do
     mv "$file" "$(echo "$file" | tr '[:upper:]' '[:lower:]')"
   done
   ```

## 测试音频播放

### 1. 重新编译应用

```bash
# iOS
npm run ios

# Android
npm run android
```

### 2. 测试钢琴

1. 打开应用
2. 双击音域区域切换到钢琴模式
3. 点击钢琴键
4. 应该能听到声音！

### 3. 查看调试日志

```bash
# 查看日志
npx react-native log-ios
# 或
npx react-native log-android
```

应该能看到类似：
```
Playing note: C4
```

## 最小化应用体积

### 只包含常用音域

对于音准练习，3个八度足够：

- **男声模式**：C3 到 C5（25键）
- **女声模式**：C4 到 C6（25键）
- **混合模式**：C3 到 C6（37键）

### 预估文件大小

| 音域 | 文件数 | AAC 256k |
|------|--------|----------|
| 1个八度（12键） | 12 | ~1.1MB |
| 3个八度（37键） | 37 | ~3.4MB |
| 全键盘（88键） | 88 | ~8.1MB |

## 故障排除

### 没有声音？

1. **检查静音开关**：确保手机/模拟器没有静音
2. **检查音量**：调高媒体音量
3. **查看日志**：确认看到 "Playing note: X4"
4. **重新编译**：添加新音频文件后需要重新编译

### 音频文件找不到？

1. iOS：确认在 Xcode 中正确添加到 target
2. Android：确认文件名全小写，在 res/raw 目录
3. 检查文件名：`C#4` 应该是 `Cs4.m4a`（iOS）或 `cs4.m4a`（Android）

### 想换用 MP3 格式？

修改 `audioUtils.ts` 中的文件名：
```typescript
// 改 .m4a 为 .mp3
const sound = new Sound(`${fileName}.mp3`, Sound.MAIN_BUNDLE, ...)
```

## 获取帮助

如果需要帮助：
1. 查看 React Native Sound 文档：https://github.com/zmxv/react-native-sound
2. 检查项目的 README.md
3. 查看 Xcode/Android Studio 的构建日志

---

**提示**：先从 3-5 个音符开始测试，确认工作正常后再添加全部音符！
