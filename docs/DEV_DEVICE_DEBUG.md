# 真机运行与日志调试（不需要 Xcode）

## 一、安装并运行到真机

```bash
cd /Users/bytedance/Desktop/go/pitch_perfect

# 启动 Metro bundler（首次或清缓存时用）
npx react-native start

# 另开终端：build + 安装到真机（Metro 已在跑时加 --no-packager）
npx react-native run-ios --device --no-packager
```

---

## 二、查看 JS 日志（console.log）

Metro 终端会直接打印 JS 层的 `console.log`。

过滤特定模块（在 Metro 所在终端之外另开一个终端）：
```bash
# 例：只看音频相关日志
npx react-native start 2>&1 | grep -E "\[RealAudio\]|\[YIN\]|\[AudioService\]"
```

---

## 三、查看原生崩溃日志

崩溃发生后，Xcode 后台会自动把手机的崩溃报告同步到 Mac：

```bash
# 列出所有 PitchPerfect 崩溃
ls ~/Library/Logs/DiagnosticReports/ | grep PitchPerfect

# 解析最新的崩溃报告（替换文件名）
cat ~/Library/Logs/DiagnosticReports/PitchPerfect-XXXX-XX-XX-XXXXXX.ips | python3 -c "
import sys, json
data = sys.stdin.read()
idx = data.index('\n{')
obj = json.loads(data[idx+1:])
print('=== EXCEPTION ===')
print(json.dumps(obj.get('exception', {}), indent=2))
threads = obj.get('threads', [])
for t in threads:
    if t.get('triggered'):
        print('\n=== CRASHED THREAD (first 20 frames) ===')
        for f in t.get('frames', [])[:20]:
            print(f.get('symbol', '') or str(f.get('imageOffset', '?')))
        break
"
```

---

## 四、查看原生 NSLog（Console.app）

```bash
# 打开 Console.app，左侧选中手机设备
open -a Console
# 搜索过滤：PitchPerfect 或 AudioAPI 或 react-native
```

---

## 五、常见问题

### Metro 端口占用
```bash
lsof -ti :8081 | xargs kill -9
npx react-native start
```

### 证书过期（免费账号 7 天后）
```bash
npx react-native run-ios --device
# 如报错，用 Xcode 打开 ios/PitchPerfect.xcworkspace 重新签名
```

### Pod 依赖变更后需要重新编译
```bash
cd ios && pod install && cd ..
npx react-native run-ios --device
```
