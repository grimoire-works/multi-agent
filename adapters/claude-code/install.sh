#!/bin/bash
# multi-agent-kit — Claude Code 安装脚本
# 用法：bash install.sh

set -e

SKILL_DIR="$HOME/.claude/skills/multi-agent-init"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/../../modules/orchestration/multi-agent-init"

echo "安装 multi-agent-kit (Claude Code 适配器)..."

# 通用 skill 安装函数
install_skill() {
  local rel_path="$1"   # 相对于 modules/ 的路径，如 productivity/learn
  local skill_name="$2" # 安装到 ~/.claude/skills/ 下的目录名
  local source_dir="$SCRIPT_DIR/../../modules/$rel_path"
  local target_dir="$HOME/.claude/skills/$skill_name"
  if [ -d "$source_dir" ]; then
    mkdir -p "$target_dir"
    for file in "$source_dir"/*.md; do
      [ -f "$file" ] || continue
      cp "$file" "$target_dir/$(basename "$file")"
    done
    echo "  ✓ $skill_name"
  fi
}

# 创建 skill 目录结构
mkdir -p "$SKILL_DIR/templates"
mkdir -p "$SKILL_DIR/references"

# 复制 SKILL.md
cp "$SOURCE_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "  ✓ SKILL.md"

# 复制 prompt 模板
for file in "$SOURCE_DIR/templates"/*.md; do
  filename=$(basename "$file")
  cp "$file" "$SKILL_DIR/templates/$filename"
  echo "  ✓ templates/$filename"
done

# 复制 references
for file in "$SOURCE_DIR/references"/*.md; do
  filename=$(basename "$file")
  cp "$file" "$SKILL_DIR/references/$filename"
  echo "  ✓ references/$filename"
done

# 复制 learn skill
install_skill "productivity/learn" "learn"
# 复制 diagnose skill
install_skill "engineering/diagnose" "diagnose"
# 复制 grill skill
install_skill "productivity/grill" "grill"

# 复制共享领域词典
cp "$SCRIPT_DIR/../../modules/CONTEXT.md" "$HOME/.claude/skills/CONTEXT.md"
echo "  ✓ CONTEXT.md（共享领域词典）"

echo ""
echo "安装完成！在 Claude Code 中说「初始化多智能体」或运行 /multi-agent-init 即可使用。"
