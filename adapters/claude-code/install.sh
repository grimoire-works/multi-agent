#!/bin/bash
# multi-agent-kit — Claude Code 安装脚本
# 用法：bash install.sh

set -e

SKILL_DIR="$HOME/.claude/skills/multi-agent-init"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPTS_DIR="$SCRIPT_DIR/../../templates"

echo "安装 multi-agent-kit (Claude Code 适配器)..."

# 创建 skill 目录
mkdir -p "$SKILL_DIR/templates"

# 复制 SKILL.md
cp "$SCRIPT_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "  ✓ SKILL.md"

# 复制 prompt 模板到 templates/（Claude Code skill 要求 templates/ 目录）
for file in "$PROMPTS_DIR"/*.md; do
  filename=$(basename "$file")
  # 映射文件名：orchestrator-subagent.md → orchestrator.md
  if [ "$filename" = "orchestrator-subagent.md" ]; then
    cp "$file" "$SKILL_DIR/templates/orchestrator.md"
    echo "  ✓ orchestrator.md"
  else
    cp "$file" "$SKILL_DIR/templates/$filename"
    echo "  ✓ $filename"
  fi
done

echo ""
echo "安装完成！在 Claude Code 中说「初始化多智能体」或运行 /multi-agent-init 即可使用。"
