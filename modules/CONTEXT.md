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
| `doc/prd/prd.md` | 产品需求文档 | PM Agent |
| `doc/dev/dev-plan.md` | 技术方案 | dev Agent |
| `doc/lessons-learned.md` | 经验教训库 | dev / frontend Agent 修正后追加，diagnose Skill 可追加 |
| `doc/handoff.md` | 编排交接文档 | 编排者在中断时生成 |
| `doc/main-log.md` | 编排日志 | 编排者 |
| `doc/test-reports/` | 测试报告 | tester Agent |

## 流程术语

**编排**：从 plan.md 读取 ⏳ 任务，逐个委托 Agent 执行的流程

**上游流程**：PM 规划 → Designer 出设计 → 技术方案 → 拆任务，发生在编排之前

**修正循环**：测试 FAIL 后 resume dev Agent 修复，最多 3 轮

**反馈循环**：diagnose 中的核心概念，可复现的 pass/fail 信号，用于定位 bug 根因

**诘问 (Grill)**：逐个问题追问用户，每个问题给出推荐答案，消除模糊性

**经验 ID (EXP-ID)**：每条经验的唯一标识，格式 EXP-NNN，自增

**置信度 (Confidence)**：经验条目的可信度评分，0.3（新建）→ 0.5（命中 1-2 次或 diagnose 产出，由 /learn 从 main-log.md 统计）→ 0.7（命中 3+ 次）→ 0.9（已提升为项目规则）

**项目规则 (Project Rule)**：从高置信度经验提升的项目级约束，存储在 `.claude/rules/`

**经验复盘 (Learn Review)**：通过 `/learn` skill 定期审查、评分、提升经验的过程

**进化管道 (Evolution Pipeline)**：经验 → 项目规则 → 全局规则的三级提升机制
