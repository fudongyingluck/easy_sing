#!/bin/bash
# 将钢琴音频文件复制到 iOS 项目

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIO_SOURCE_DIR="$PROJECT_DIR/assets/audio/piano"
IOS_PROJECT_DIR="$PROJECT_DIR/ios"

echo "🎹 钢琴音频 - iOS 项目设置"
echo "=============================="

# 检查音频文件
if [ ! -d "$AUDIO_SOURCE_DIR" ]; then
    echo "❌ 错误: 音频目录不存在: $AUDIO_SOURCE_DIR"
    exit 1
fi

AUDIO_COUNT=$(ls -1 "$AUDIO_SOURCE_DIR"/*.mp3 2>/dev/null | wc -l | tr -d ' ')
if [ "$AUDIO_COUNT" -eq 0 ]; then
    echo "❌ 错误: 未找到音频文件"
    exit 1
fi

echo "✅ 找到 $AUDIO_COUNT 个音频文件"
echo ""

# 创建 iOS 资源目录（如果需要）
IOS_AUDIO_DIR="$IOS_PROJECT_DIR/PitchPerfect/Audio"
mkdir -p "$IOS_AUDIO_DIR"

# 复制文件
echo "📦 复制音频文件到 iOS 项目..."
cp "$AUDIO_SOURCE_DIR"/*.mp3 "$IOS_AUDIO_DIR/"

echo "✅ 文件已复制到: $IOS_AUDIO_DIR"
echo ""
echo "⚠️  重要: 接下来需要在 Xcode 中手动添加这些文件！"
echo ""
echo "📋 Xcode 设置步骤："
echo "1. 打开项目: open $IOS_PROJECT_DIR/PitchPerfect.xcworkspace"
echo "2. 在左侧导航器中，右键点击 \"PitchPerfect\" 项目"
echo "3. 选择 \"Add Files to PitchPerfect...\""
echo "4. 导航到: $IOS_AUDIO_DIR"
echo "5. 选择所有 .mp3 文件"
echo "6. ✅ 勾选 \"Copy items if needed\""
echo "7. ✅ 勾选 \"Add to target: PitchPerfect\""
echo "8. 点击 \"Add\""
echo ""
echo "9. 重新编译应用: npm run ios"
echo ""
echo "想要现在打开 Xcode 吗？(y/n)"
read -r answer

if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    open "$IOS_PROJECT_DIR/PitchPerfect.xcworkspace"
fi
