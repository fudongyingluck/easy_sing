# Xcode 添加音频文件 - 30 秒搞定！

## 步骤：

1. **打开 Xcode**
   ```bash
   cd ios
   open PitchPerfect.xcworkspace
   ```

2. **在 Xcode 中**
   - 看左边的文件导航器
   - 找到 `PitchPerfect` 文件夹（蓝色图标）
   - **右键点击** 它
   - 选择 **"Add Files to PitchPerfect..."**

3. **选择文件**
   - 在弹出的窗口中，找到 `Audio` 文件夹
   - 按 `Cmd+A` 全选所有 MP3 文件
   - ✅ **勾选 "Copy items if needed"**
   - ✅ **勾选 "Add to target: PitchPerfect"**
   - 点击 **"Add"**

4. **重新运行**
   ```bash
   cd ..
   npm run ios
   ```

就这么简单！🎉

---

## 为什么需要这步？

- **开发时**：需要告诉 Xcode "这些文件要打包进应用"
- **发布后**：文件已经在 IPA 里了，用户直接用
- **只做一次**：下次添加新文件才需要再做
