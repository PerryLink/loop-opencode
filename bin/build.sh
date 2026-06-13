#!/usr/bin/env bash
#
# loop-opencode 跨平台编译脚本
#
# 编译 src/index.ts 为 5 个平台原生二进制：
#   - linux-x64
#   - linux-arm64
#   - macos-x64
#   - macos-arm64
#   - windows-x64
#
# 前提条件：
#   - Bun >= 1.0 已安装
#   - 在项目根目录下执行
#
# 用法：
#   bash bin/build.sh                    # 编译全部 5 平台
#   bash bin/build.sh linux-x64          # 仅编译指定平台
#

set -euo pipefail

# 项目根目录（脚本所在目录的父目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# 输出目录
DIST_DIR="$PROJECT_ROOT/dist"
mkdir -p "$DIST_DIR"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 所有目标平台
ALL_PLATFORMS=(
  "linux-x64"
  "linux-arm64"
  "macos-x64"
  "macos-arm64"
  "windows-x64"
)

# 平台到 bun target 映射
declare -A TARGET_MAP=(
  ["linux-x64"]="bun-linux-x64"
  ["linux-arm64"]="bun-linux-arm64"
  ["macos-x64"]="bun-macos-x64"
  ["macos-arm64"]="bun-macos-arm64"
  ["windows-x64"]="bun-windows-x64"
)

# 确定要编译的平台
PLATFORMS=()
if [ $# -eq 0 ]; then
  PLATFORMS=("${ALL_PLATFORMS[@]}")
else
  PLATFORMS=("$@")
fi

echo -e "${GREEN}[build] loop-opencode 编译脚本${NC}"
echo "[build] 项目根目录: $PROJECT_ROOT"
echo "[build] 输出目录: $DIST_DIR"
echo ""

# 检查 Bun
if ! command -v bun &> /dev/null; then
  echo -e "${RED}[build] 错误: 未找到 Bun。请安装 Bun >= 1.0 (https://bun.sh)${NC}"
  exit 1
fi

BUN_VERSION=$(bun --version)
echo "[build] Bun 版本: $BUN_VERSION"
echo ""

# 编译每个平台
SUCCESS_COUNT=0
FAIL_COUNT=0

for platform in "${PLATFORMS[@]}"; do
  target="${TARGET_MAP[$platform]:-}"

  if [ -z "$target" ]; then
    echo -e "${RED}[build] 未知平台: $platform${NC}"
    echo "[build] 支持的平台: ${ALL_PLATFORMS[*]}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    continue
  fi

  outfile="$DIST_DIR/loop-opencode-${platform}"
  # Windows 二进制加 .exe 后缀
  if [[ "$platform" == "windows-x64" ]]; then
    outfile="${outfile}.exe"
  fi

  echo -e "${YELLOW}[build] 编译: $platform → $outfile${NC}"

  if bun build --compile \
    --target="$target" \
    --outfile="$outfile" \
    src/index.ts 2>&1; then
    echo -e "${GREEN}  ✓ $platform 编译成功${NC}"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo -e "${RED}  ✗ $platform 编译失败${NC}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  echo ""
done

# 输出汇总
echo "=========================================="
echo -e "[build] 编译完成: ${GREEN}${SUCCESS_COUNT} 成功${NC}, ${RED}${FAIL_COUNT} 失败${NC}"
echo "[build] 产出物:"
ls -la "$DIST_DIR/"loop-opencode-* 2>/dev/null || echo "  (无产出)"
echo "=========================================="

if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi
exit 0
