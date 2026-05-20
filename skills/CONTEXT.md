# Multi-Agent Kit 领域语言

所有 Skill 共用的术语定义，避免各 Skill 各自定义术语导致歧义。

## 角色

**Agent**：具有特定职责的子智能体，定义在 `.claude/agents/{代号}-*.md`

**编排者 (Orchestrator)**：协调多个 Agent 的主智能体，只调度不干活，不直接编写源代码

**任务**：plan.md 中的一行，包含编号、标题、状态、涉及文件、验收标准

**验收标准 (AC)**：每条格式为"操作 → 期望结果"，由 tester Agent 逐条验证

## 产出文件

| 文件 | 职责 | 谁写入 |
|------|------|--------|
| `doc/plan.md` | 任务列表 + 验收标准 + 进度 | 编排者管理，PM 可写入 |
| `doc/prd.md` | 产品需求文档 | PM Agent |
| `doc/tech-plan.md` | 技术方案 | dev Agent |
| `doc/lessons-learned.md` | 经验教训库 | dev / frontend Agent 修正后追加 |
| `doc/handoff.md` | 编排交接文档 | 编排者在中断时生成 |
| `doc/main-log.md` | 编排日志 | 编排者 |
| `doc/test-reports/` | 测试报告 | tester Agent |

## 流程术语

**编排**：从 plan.md 读取 ⏳ 任务，逐个委托 Agent 执行的流程

**上游流程**：PM 规划 → Designer 出设计 → 技术方案 → 拆任务，发生在编排之前

**修正循环**：测试 FAIL 后 resume dev Agent 修复，最多 3 轮

**反馈循环**：diagnose 中的核心概念，可复现的 pass/fail 信号，用于定位 bug 根因

**诘问 (Grill)**：逐个问题追问用户，每个问题给出推荐答案，消除模糊性
