#!/bin/bash
# 钢琴音频转换脚本
# 使用方法: ./convert_audio.sh [输入目录] [输出目录]

set -e

INPUT_DIR="${1:-.}"
OUTPUT_DIR="${2:-./converted}"

echo "🎹 钢琴音频转换工具"
echo "======================"
echo "输入目录: $INPUT_DIR"
echo "输出目录: $OUTPUT_DIR"
echo ""

# 检查 ffmpeg 是否安装
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ 错误: ffmpeg 未安装"
    echo "请先安装 ffmpeg:"
    echo "  macOS: brew install ffmpeg"
    echo "  Ubuntu: sudo apt-get install ffmpeg"
    exit 1
fi

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 统计文件数
WAV_COUNT=$(find "$INPUT_DIR" -maxdepth 1 -name "*.wav" | wc -l | tr -d ' ')
MP3_COUNT=$(find "$INPUT_DIR" -maxdepth 1 -name "*.mp3" | wc -l | tr -d ' ')
TOTAL_COUNT=$((WAV_COUNT + MP3_COUNT))

if [ "$TOTAL_COUNT" -eq 0 ]; then
    echo "❌ 未找到音频文件（.wav 或 .mp3）"
    echo "请在当前目录放置钢琴音频文件"
    exit 1
fi

echo "找到 $TOTAL_COUNT 个音频文件"
echo ""

# 转换函数
convert_file() {
    local input_file="$1"
    local filename=$(basename "$input_file")
    local name="${filename%.*}"
    local output_file="$OUTPUT_DIR/$name.m4a"

    # 替换 # 为 s
    output_file=$(echo "$output_file" | sed 's/#/s/g')

    echo "转换: $filename → $(basename "$output_file")"

    ffmpeg -i "$input_file" \
        -c:a aac \
        -b:a 256k \
        -movflags +faststart \
        -y \
        -loglevel error \
        "$output_file"
}

export -f convert_file
export OUTPUT_DIR

# 转换所有 WAV 文件
if [ "$WAV_COUNT" -gt 0 ]; then
    echo "处理 WAV 文件..."
    find "$INPUT_DIR" -maxdepth 1 -name "*.wav" -exec bash -c 'convert_file "$0"' {} \;
fi

# 转换所有 MP3 文件
if [ "$MP3_COUNT" -gt 0 ]; then
    echo "处理 MP3 文件..."
    find "$INPUT_DIR" -maxdepth 1 -name "*.mp3" -exec bash -c 'convert_file "$0"' {} \;
fi

echo ""
echo "✅ 转换完成！"
echo "输出文件在: $OUTPUT_DIR"
echo ""

# 列出转换后的文件
echo "转换后的文件列表："
ls -1 "$OUTPUT_DIR" | sort
echo ""

# 显示文件大小
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
echo "总大小: $TOTAL_SIZE"
