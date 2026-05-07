# multi-agent-init

Claude Code Skill — 为任意项目一键初始化多智能体开发工作流。

## 功能

- 自动探测项目信息（语言、框架、构建命令等）
- 5 种 Agent 角色按需选择：核心开发 / 质量测试 / 前端开发 / 产品经理 / UI 设计师
- 自动生成 Agent 定义、编排 prompt、任务计划（含验收标准）
- 支持全新初始化和增量添加

## 安装

将整个目录复制到 Claude Code 的 skills 目录：

```bash
cp -r multi-agent-init ~/.claude/skills/
```

## 使用

在任意项目中触发：

```
初始化多智能体
```

或使用命令：

```
/multi-agent-init
```

指定 Agent（跳过交互选择）：

```
/multi-agent-init dev tester
```

## 工作流

初始化完成后，说"走编排流程"启动自动编排：

1. 逐任务循环：开发 Agent 编码 → 测试 Agent 验证
2. FAIL 自动进入修正循环（最多 3 轮）
3. 经验教训自动注入后续任务
4. 全部完成输出统计报告

## Agent 角色

| 角色 | 职责 |
|------|------|
| dev 核心开发 | 算法、业务逻辑、数据处理 |
| tester 质量测试 | AC 验证 + 代码审查 + 测试报告 |
| frontend 前端开发 | 页面、组件、动画、主题 |
| pm 产品经理 | 需求分析、任务拆解、PRD |
| designer UI设计师 | 界面方案、交互规范、视觉标准 |

## 产出文件

| 文件 | 作用 |
|------|------|
| `.claude/agents/{代号}-*.md` | Agent 角色定义 |
| `.claude/主智能体提示词.md` | 串行编排 prompt |
| `.claude/主智能体提示词-teams.md` | 并行编排 prompt（>10 任务） |
| `doc/plan.md` | 任务列表 + 验收标准 |
| `doc/lessons-learned.md` | 经验教训库 |
| `doc/main-log.md` | 编排日志 |
| `doc/test-reports/` | 测试报告目录 |

## License

MIT
