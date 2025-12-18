#!/bin/bash

# 图片转换为 WebP 格式的脚本
# 使用方法：bash convert-to-webp.sh

echo "开始转换图片为 WebP 格式..."

# 检查是否安装了 cwebp
if ! command -v cwebp &> /dev/null; then
    echo "错误: 未找到 cwebp 工具"
    echo "请先安装 webp 工具："
    echo "  Ubuntu/Debian: sudo apt install webp"
    echo "  macOS: brew install webp"
    echo "  Windows: 从 https://developers.google.com/speed/webp/download 下载"
    exit 1
fi

# 转换 img 目录下的所有 PNG 文件
cd img

for file in *.png; do
    if [ -f "$file" ]; then
        output="${file%.png}.webp"
        echo "转换: $file -> $output"
        # -q 80 表示质量为 80（0-100，推荐 75-85）
        # -m 6 表示最高压缩级别（0-6）
        cwebp -q 80 -m 6 "$file" -o "$output"

        if [ $? -eq 0 ]; then
            # 显示文件大小对比
            original_size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file")
            webp_size=$(stat -c%s "$output" 2>/dev/null || stat -f%z "$output")
            echo "  原始: $original_size bytes -> WebP: $webp_size bytes"
        fi
    fi
done

cd ..

echo ""
echo "转换完成！"
echo "现在可以提交更改到 Git"
