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

        # 显示文件大小对比
        original_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
        webp_size=$(stat -f%z "$output" 2>/dev/null || stat -c%s "$output")
        reduction=$(echo "scale=1; (1 - $webp_size / $original_size) * 100" | bc)
        echo "  原始: $(numfmt --to=iec $original_size) -> WebP: $(numfmt --to=iec $webp_size) (减少 ${reduction}%)"
    fi
done

echo ""
echo "转换完成！"
echo "现在可以修改 README.md 以使用 WebP 格式"