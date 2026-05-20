#!/bin/bash
# multi-agent-kit — Claude Code 安装脚本
# 用法：bash install.sh

set -e

SKILL_DIR="$HOME/.claude/skills/multi-agent-init"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/../../skills/orchestration/multi-agent-init"

echo "安装 multi-agent-kit (Claude Code 适配器)..."

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

echo ""
echo "安装完成！在 Claude Code 中说「初始化多智能体」或运行 /multi-agent-init 即可使用。"
