# 音高模板功能 TODO

## 进度说明
- [ ] 未开始
- [~] 进行中
- [x] 已完成

---

## 按功能测试顺序（可测即测）

> 每个功能完成后即可端到端测试，无需等待全部模块完工。

### F1：模板 Tab 页面框架
可测效果：打开 App 能看到底部第四个「模板」Tab，点进去有空列表页

- [x] 底部新增「模板」Tab（`App.tsx`）
- [x] `TemplatesScreen.tsx` 骨架页（空列表 + 右上角「＋」按钮占位）
- [x] 模板元数据类型定义（`PitchTemplate` interface）
- [x] `templateStorage.ts`：`loadTemplates` / `saveTemplates` / `addTemplate` / `deleteTemplate`

### F2：从文件导入（不含音高分析）
可测效果：点「＋」→「从文件导入」→ 选一个 mp3 → 列表出现新模板条目（无音高数据）

- [x] Native `pickAudioFile`（文件选择器）
- [x] Native `copyAudioFileToImports`（复制到沙盒）
- [x] JS `documentPicker.ts` 封装
- [x] 模板列表显示（名称、时长、来源文件名）
- [x] 超过 10 分钟弹确认截断提示

### F3：音高分析
可测效果：导入文件后看到 Loading 转圈，结束后点击模板能看到音高曲线（此时还不能播放音频）

- [ ] Native `analyzeAudioFile`（后台 YIN 分析，返回 `{points, duration}`）
- [ ] JS 层调用 + Loading 状态
- [ ] 音高数据写入 AsyncStorage
- [ ] 分析失败 / 空音频错误处理

### F4：模板播放（和录音列表一样）
可测效果：点击模板条目 → 进入播放页 → 能播放音频 + 查看音高曲线（复用录音播放页逻辑）

- [ ] `PitchCanvas` 新增 `templateData` prop（渲染橙色半透明曲线）
- [ ] `PitchChart` 透传 `templateData`
- [ ] 模板点击进入播放页

### F5：练习页选模板 + 曲线叠加
可测效果：练习页 Header 有「无模板」按钮 → 选一个模板 → 录音时背景出现橙色参考曲线

- [ ] 练习页 Header 模板选择按钮
- [ ] 模板选择 Modal（有/无模板两种状态）
- [ ] 加载模板音高数据并传给 `PitchChart`
- [ ] 页面 focus 时检查模板是否仍存在

### F6：录音时同步播放模板音频
可测效果：选好模板 → 开始录音 → 同时能听到模板音频播放（建议戴耳机测试）

- [ ] Native `isHeadphonesConnected` 方法
- [ ] 无耳机弹提示
- [ ] 录音开始/暂停/继续/停止时同步控制模板音频播放

### F7：从录音历史创建模板
可测效果：「＋」→「从录音历史选择」→ 选一条录音 → 立即生成模板（无需分析）

- [ ] `createTemplateFromRecording`（直接引用，不复制数据）
- [ ] TemplatesScreen 内嵌录音历史选择列表

### F8：完善交互与边界处理
可测效果：删除/重命名/多选/文件损坏等异常场景

- [ ] 重命名（长按弹 Alert）
- [ ] 多选模式 + 批量删除
- [ ] 删录音时检查模板引用，弹二次确认
- [ ] 文件损坏 / 格式不支持错误提示
- [ ] 整体走查

---

## 一、Native 层

### 1.1 音频文件分析
- [ ] `PitchDetectorModule.mm`：新增 `analyzeAudioFile:(NSString *)filePath` 方法
  - [ ] 后台线程执行（`dispatch_async`）
  - [ ] 使用 `AVAudioFile` 解码为 float32 PCM（自动支持 mp3/m4a/wav/aac）
  - [ ] 立体声转单声道（左右声道取平均值）
  - [ ] 限制最大 10 分钟，超出截断
  - [ ] 复用现有 `yin_detect` 函数跑音高分析，每 100ms 取一个结果（10 Hz 存储）
  - [ ] 返回 `{ points: [{time, freq}], duration }`

### 1.2 文件选择器
- [ ] `AudioSessionModule.swift`：新增 `pickAudioFile` 方法
  - [ ] 弹出 `UIDocumentPickerViewController`（`UTType.audio`，`asCopy: false`）
  - [ ] 用户取消时返回 `null`，选中时返回原始文件路径（不复制到沙盒）
- [ ] `AudioSessionModule.swift`：新增 `copyAudioFileToImports(srcPath)` 方法
  - [ ] 将原始路径文件复制到 `Documents/PitchPerfect/Imports/`，返回沙盒内完整路径
- [ ] `AudioSessionModule.m`：通过 `RCT_EXTERN_METHOD` 暴露 `pickAudioFile` 和 `copyAudioFileToImports`

### 1.3 微信分享接收
- [ ] `Info.plist` 注册 `CFBundleDocumentTypes`，支持 mp3 / m4a / wav / aac

---

## 二、JS 服务层

### 2.1 类型定义
- [ ] `src/types/index.ts`：新增 `PitchTemplate` interface

### 2.2 Native 桥接
- [ ] `src/services/nativePitchRecorder.ts`：新增 `analyzeAudioFile(filePath)` 方法
- [ ] `src/services/documentPicker.ts`（新文件）：封装 `pickAudioFile()` 调用

### 2.3 模板存储
- [ ] `src/services/templateStorage.ts`（新文件）
  - [ ] `loadTemplates(): Promise<PitchTemplate[]>`
  - [ ] `saveTemplates(templates): Promise<void>`
  - [ ] `addTemplate(template): Promise<void>`
  - [ ] `deleteTemplate(id): Promise<void>`
    - [ ] 来源为导入文件：同步删除音高数据 + Imports 沙盒文件
    - [ ] 来源为录音引用：只删模板元数据，不动原录音
  - [ ] `createTemplateFromRecording(recording): Promise<PitchTemplate>`：从录音直接创建模板引用，不复制数据
  - [ ] `resolveTemplateAudioPath(filename): Promise<string>`（参考 `resolveRecordingPath`）
- [ ] `src/screens/RecordingsScreen.tsx`：删除录音前检查是否有模板引用该录音（`sourceRecordingId` 匹配）
    - [ ] 有引用时弹二次确认：「该录音已被设为模板"XXX"，是否同时删除该模板？」
    - [ ] 选「同时删除」→ 删录音 + 删模板，练习页清空选中状态
    - [ ] 选「保留模板」→ 将录音音频文件复制到 `Imports/` 目录 → 更新模板 `audioFilePath` 指向副本 → 再删除原录音

---

## 三、组件层

### 3.1 PitchCanvas
- [ ] `src/components/PitchCanvas.tsx`
  - [ ] 新增 `templateData?: PitchDataPoint[]` prop
  - [ ] 在底层渲染模板曲线（橙色 `#FF9500`，opacity 0.25，同样用 Catmull-Rom 插值）

### 3.2 PitchChart
- [ ] `src/components/PitchChart.tsx`
  - [ ] 新增 `templateData?: PitchDataPoint[]` prop，透传给 `PitchCanvas`

---

## 四、页面层

### 4.1 模板页（新建）
- [ ] `src/screens/TemplatesScreen.tsx`
  - [ ] 模板列表：名称、时长、来源（文件名 or 录音名）
  - [ ] 右上角「＋」按钮：弹来源选择 ActionSheet
    - [ ] 选项一「从文件导入」→ 调用文件选择器（返回原始路径，不复制）→ 读取音频时长
      - [ ] 时长 ≤ 10 分钟：复制文件到 `Imports/` → Loading → YIN 分析 → 插入列表
      - [ ] 时长 > 10 分钟：弹提示询问是否截取前 10 分钟
        - [ ] 用户取消 → 放弃导入，不做任何操作（无需清理）
        - [ ] 用户确认 → 复制文件到 `Imports/` → Loading → YIN 分析（Native 截断到10分钟）→ 插入列表
    - [ ] 选项二「从微信导入」
      - [ ] 通过 `Linking.openURL('weixin://')` 跳转微信
      - [ ] 页面显示操作引导文字（长按 → 用其他应用打开 → 选择本 app）
      - [ ] 若微信未安装（`Linking.canOpenURL` 返回 false），按钮置灰并提示「未检测到微信」
      - [ ] `Info.plist` 注册 `CFBundleDocumentTypes`（mp3 / m4a / wav / aac）
      - [ ] `Info.plist` 的 `LSApplicationQueriesSchemes` 添加 `weixin`
    - [ ] 选项三「从录音历史选择」→ 页内展示录音历史列表 → 用户选择一条 → 直接创建模板引用，无需分析
  - [ ] 点击单条：进入播放页（复用录音播放页逻辑）
  - [ ] 每行常驻「分享（↗）」「删除（✕）」按钮（与录音列表一致）
  - [ ] Header 右上角「选择」按钮：进入多选模式
    - [ ] 每行显示复选框，隐藏常驻按钮
    - [ ] Header 变为「取消」+「全选/全不选」，标题处显示已选数量
    - [ ] 底部出现「删除」按钮，点击弹确认弹窗后批量删除
  - [ ] 重命名：长按名称文字弹 Alert 输入框（与录音列表一致）

### 4.2 底部导航
- [ ] `src/App.tsx`：新增第四个 Tab「模板」，图标 `musical-notes-outline`

### 4.3 练习页
- [ ] `src/screens/PracticeScreen.tsx`
  - [ ] Header 右侧新增文字按钮（无图标，样式同录音列表的「选择」）：未选中显示「无模板」，选中后显示模板名称前 4 个字符
  - [ ] 点击始终弹出 Modal
  - [ ] Modal 内容（有模板）：「不使用模板」选项 + 模板列表
  - [ ] Modal 内容（无模板）：空状态提示文字 + 「前往模板页导入」按钮（关闭 Modal 并跳转模板 Tab）
  - [ ] 选中后加载模板音高数据（`loadPitchData`）存入 state
  - [ ] 将模板数据传给 `PitchChart` 的 `templateData` prop
  - [ ] 练习页 `focus` 时检查已选模板是否仍存在，若已被删除则自动清空，按钮恢复「无模板」

### 4.4 模板音频同步播放
- [ ] `src/screens/PracticeScreen.tsx`
  - [ ] 开始录音前检测耳机状态（读 `AVAudioSession.currentRoute.outputs`，通过 Native 方法暴露）
  - [ ] 无耳机时弹提示，用户确认后继续
  - [ ] 开始录音时同步播放模板音频（使用 `react-native-sound`，从头播放）
  - [ ] 暂停 / 继续 / 停止录音时同步控制模板音频
  - [ ] 模板音频播完后静默结束，不影响录音
- [ ] `AudioSessionModule.swift`：新增 `isHeadphonesConnected()` 方法，返回当前是否有耳机/蓝牙音频输出
- [ ] `AudioSessionModule.m`：暴露 `isHeadphonesConnected`

---

## 五、收尾

- [ ] 整体走查：导入 → 分析 → 切换到练习页选模板 → 演唱叠加显示
- [ ] 边界情况处理
  - [ ] 文件损坏 / 格式不支持：弹错误提示，同时询问「是否删除该文件？」，用户确认后删除沙盒内已复制的文件
  - [ ] 空音频（全静音）：提示分析结果为空，同时询问「是否删除该文件？」，用户确认后删除沙盒内已复制的文件
  - [ ] 分析超时或内存不足：弹提示，不保存
- [ ] 删除模板时确认清理：AsyncStorage 音高数据 + `Imports/` 沙盒文件
- [ ] 如有方案变更，同步更新 `docs/template_design.md`
