# CLAUDE.md 追加规则

初始化 Step 6 时，将以下内容追加到目标项目的 CLAUDE.md。

## 追加内容格式

```markdown
## 多智能体工作流

本项目使用**主智能体编排 + 子Agent分工**的工作模式。

### 何时使用编排模式

**走编排流程的触发方式**（读 `.claude/主智能体提示词.md`，按流程执行）：
- 用户说"走编排流程"/"编排"/"开始执行"且 `doc/plan.md` 中有 ⏳ 任务
- 用户确认新功能/需求后（如"开始开发"、"方案OK，开始实施"等），**必须用 AskUserQuestion 询问**：
  > 检测到新需求已确认，怎么推进？
  > - 完整流程：PM 规划需求 → Designer 出设计稿 → 评审确认 → 走编排
  > - PM 规划后直接开发：PM 规划需求 → 走编排
  > - 直接开发：任务已明确，直接走编排

选择"完整流程"或"PM 规划"时，先委托对应 Agent 完成上游工作，**上游产出经用户确认后再写入 plan.md 并启动编排**。
选择"直接开发"时，用户需手动填写 plan.md 或已确认任务内容，然后走编排。

**其他日常对话和简单问题直接处理**，不启动编排。

**核心规则**：主Agent只调度不干活，不直接编辑源代码文件。

### 执行模式

- **Subagent 串行模式**（默认）：适合 ≤10 个任务，稳定可控
  - 提示词：`.claude/主智能体提示词.md`
- **Agent Teams 并行模式**：适合 >10 个任务，需要启用实验性功能
  - 提示词：`.claude/主智能体提示词-teams.md`
  - 启用方式：在 `~/.claude/settings.json` 添加 `{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"1"}}`

说"走编排流程"时，会根据任务数自动建议执行模式。
```

## Agent 分工行

根据所有 Agent（已有 + 新增），追加对应的行：

```
{如果有 pm}       → - 需求规划 → 委托 `{代号}-pm` 子Agent
{如果有 designer}  → - UI 设计 → 委托 `{代号}-designer` 子Agent
{如果有 frontend} → - 前端开发 → 委托 `{代号}-frontend` 子Agent
{如果有 dev}      → - 核心开发 → 委托 `{代号}-dev` 子Agent
{如果有 tester}   → - 测试审查 → 委托 `{代号}-tester` 子Agent
```

## 公共文档行（始终包含）

```
- 任务计划 → `doc/plan.md`（主Agent管理）
- 经验库 → `doc/lessons-learned.md`（开发Agent追加）
- 协调日志 → `doc/main-log.md`（主Agent编写）
{如果有 tester}    → - 测试报告 → `doc/test-reports/`（测试Agent写入）
{如果有 pm}       → - PRD 文档 → `doc/prd/prd.md`（PM Agent写入）
{如果有 designer}  → - 设计方案 → `doc/design/`（designer Agent写入）
```

## UI 开发规则

当满足以下任一条件时，从 `templates/designer-agent.md` 中提取 `<!-- CLAUDE.md-rules -->` 之后的「项目级 UI 规则」内容，追加到 CLAUDE.md 末尾：

- 用户选了 designer 或 frontend Agent
- 项目检测到前端文件（`.vue` / `.tsx` / `.jsx` / `.dart` / `.svelte` / `.html`）

纯后端项目（无前端文件且未选前端相关 Agent）**不追加**。

提取方式：读取 `templates/designer-agent.md`，找到 `<!-- CLAUDE.md-rules -->` 标记，取标记后面的 `## 项目级 UI 规则` 整段内容，追加到目标项目的 CLAUDE.md。

## 增量模式处理

找到 CLAUDE.md 中的 `## 多智能体工作流` 章节，替换为包含所有 Agent（已有 + 新增）的新版本。

如果 CLAUDE.md 不存在，先运行 `/init` 创建。
