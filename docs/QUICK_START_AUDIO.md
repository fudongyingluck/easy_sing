# 快速添加钢琴声音（5分钟版）

## 最简单的方法：先测试一个音符

### 1. 获取一个测试音频

**方法 A：从 GarageBand 导出（macOS）**

1. 打开 GarageBand
2. 选择"软件乐器"
3. 选择钢琴音色
4. 按 C4 键录制 2-3 秒
5. 分享 → 导出歌曲到磁盘 → 格式：AAC
6. 重命名为 `C4.m4a`

**方法 B：下载免费单音**

访问：https://freesound.org/
搜索 "piano C4"，下载一个免费的

### 2. 添加到 iOS 项目

```bash
cd ios
open PitchPerfect.xcworkspace
```

在 Xcode 中：
1. 右键点击项目名 → "Add Files to PitchPerfect..."
2. 选择 `C4.m4a`
3. ✅ 勾选 "Copy items if needed"
4. ✅ 勾选 "Add to target: PitchPerfect"
5. 点击 "Add"

### 3. 测试

```bash
# 回到项目根目录
cd ..
npm run ios
```

打开应用，点击 C4 键（中央C），应该能听到声音！

---

## 快速获取全套钢琴采样

### 推荐：University of Iowa Piano Samples

这是免费、高质量的钢琴采样！

**下载地址：**
https://theremin.music.uiowa.edu/MISpiano.html

**下载步骤：**

1. 访问上面的网址
2. 下载 "Piano, Steinway D, Recording Location 1 (24-bit, 44.1 kHz)"
3. 或者下载 "Piano, Steinway D, Recording Location 2"（更适合近距离）
4. 解压下载的文件

**转换步骤：**

```bash
# 1. 进入下载的文件夹
cd ~/Downloads/UIowa\ Piano

# 2. 使用我们的转换脚本
/Users/bytedance/Desktop/go/pitch_perfect/scripts/convert_audio.sh . ./converted

# 3. 查看转换结果
ls -lh ./converted
```

**只选常用音符（可选）：**

如果不想下载全部，可以只选：
- C3 到 C5（男声常用）
- 或 C4 到 C6（女声常用）

---

## 使用 GitHub 上的现成采样

搜索 "piano sample pack github"，例如：

**推荐：**
- https://github.com/pedyry/piano-samples
- https://github.com/sfzinstruments/GUGGS

---

## 下一步

测试成功后，查看完整文档：
`docs/PIANO_AUDIO_SETUP.md`

里面有详细的 Android 设置、批量转换、故障排除等内容。

---

## 常见问题

**Q: 还是没声音？**
- 检查手机静音键
- 调高媒体音量
- 看 Xcode 日志有没有 "Playing note: C4"

**Q: 可以用 MP3 吗？**
- 可以，但 AAC 256k 音质更好体积更小
- 修改 audioUtils.ts 把 .m4a 改成 .mp3

**Q: 应用太大了？**
- 只留 3 个八度（37键），约 3MB
- 详见完整文档的"最小化应用体积"部分
