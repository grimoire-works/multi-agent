# multi-agent-kit

一套跨平台的多智能体开发工作流套件。为任意项目配置开发-测试编排体系，支持从已有项目启动。

## 两种使用方式，怎么选？

本项目提供**两条独立的运行路径**，共享同一套方法论（模板 + 编排规则 + 经验库）：

| | 方式一：Claude Code Skill | 方式二：CLI 独立运行 |
|---|---|---|
| 适合谁 | Claude Code 用户 | 没有 Claude Code、想无人值守 / 进 CI 跑的场景 |
| 依赖 | Claude Code | Node.js 18+、`ANTHROPIC_API_KEY` |
| 编排执行者 | Claude Code 主智能体（读编排提示词调度） | `multi-agent-kit run`（代码状态机驱动） |
| **能力** | **完整版**（见下） | 核心循环 + 代码级可靠性 |

### 能力对比

| 能力 | Skill | CLI |
|---|---|---|
| 核心循环：开发 → 测试 → 修正（最多 3 轮） | ✅ | ✅ |
| Wave 并行模式（无文件冲突的任务同时开发） | ✅ 自动（>10 任务切 Teams 模板） | ✅ 配置开启（`orchestration.parallel`） |
| 分级经验注入（项目规则 > 高置信度 > 关键词匹配，≤5 条） | ✅ | ✅ |
| PM / Designer 上游流程（PRD、设计稿、技术方案） | ✅ | ❌（需交互澄清需求，见_skill 独有_） |
| 中途与用户对话澄清需求 | ✅ | ❌（run 起来无人交互） |
| /grill 诘问、/diagnose 调试、/learn 经验复盘 | ✅ | ❌（skill 独有；CLI 侧经验数据照常写入，可在 Claude Code 中复盘） |
| 中断交接 handoff.md（"明天继续"） | ✅ | 断点续跑（state.json 恢复，无需交接文档） |
| PASS/FAIL 判定、轮次上限、状态落盘 | 靠模型遵守提示词 | **硬代码保证**，模型想不守规矩都不行 |

> 两条路径可以混用：CLI `init` 会同时生成 `.claude/` 下的全套 agent 定义与编排提示词，初始化后的项目既能在终端跑 `run`，也能直接在 Claude Code 里说"走编排流程"。

## 核心理念

- **5 种 Agent 角色**：核心开发 / 质量测试 / 前端开发 / 产品经理 / UI 设计师，按需组合
- **编排模式**：主智能体只调度不干活，全部委托给子 Agent
- **验收标准驱动**：每个任务定义可执行的验收条件，tester 逐条验证
- **任务粒度约束**：30-150 行 / 1-3 AC / 涉及文件 ≤ 3 个，避免大任务拖慢执行
- **通用协作原则**：P-001 ~ P-006 跨项目 meta-rule，init 时自动注入项目 `.claude/rules/principles.md`
- **经验积累**：lessons-learned 分级注入后续任务（项目规则 > 置信度 ≥ 0.7 > 关键词匹配），支持衰减归档与进化管道（经验 → 项目规则 → 全局规则）
- **确定性与灵活性分治**：轮次、判定、状态由代码/规则写死；写代码、判断质量交给 Agent

## 项目结构

```
multi-agent-kit/
├── modules/                               # 能力模块（Skill 路径的全部内容）
│   ├── CONTEXT.md                         # 共享领域语言
│   ├── orchestration/
│   │   └── multi-agent-init/
│   │       ├── SKILL.md                   # 模块入口定义
│   │       ├── templates/                 # Agent 模板（CLI + Skill 共用）
│   │       │   ├── dev-agent.md / tester-agent.md / frontend-agent.md
│   │       │   ├── pm-agent.md / designer-agent.md
│   │       │   └── orchestrator.md / orchestrator-teams.md
│   │       └── references/               # 扩展参考文档
│   │           ├── principles.md           # 通用协作原则 P-001~P-006
│   │           ├── file-formats.md         # 文件格式契约
│   │           └── harness-design-lessons.md  # 平台机制踩坑记录
│   ├── engineering/
│   │   └── diagnose/                      # 纪律性调试模块（修正 ≥3 轮未通过时使用）
│   └── productivity/
│       ├── grill/                         # 诘问式对话模块（需求/方案评审）
│       └── learn/                         # 经验复盘模块（评分/提升/归档）
│
├── src/                                   # CLI 独立运行时（编译到 dist/）
│   ├── index.ts                           # 命令入口（init / run / status）
│   ├── commands/                          # 命令实现
│   ├── core/                              # 编排核心
│   │   ├── orchestrator.ts                 # 编排循环（串行 + Wave 并行）
│   │   ├── lessons.ts                      # 分级经验注入 + 注入日志
│   │   ├── waves.ts                        # Wave 任务分组
│   │   ├── plan-parser.ts                  # plan.md 解析
│   │   ├── state-manager.ts                # 状态持久化与断点恢复
│   │   └── agent-runner.ts                 # Agent 会话封装
│   └── types/
│
└── tests/                                 # vitest 单元测试（npm test）
```

## 快速开始

### 方式一：Claude Code Skill（完整功能）

**从云社区安装**（推荐）：搜索 `multi-agent-init` 一键安装。

**从本项目安装**：

```bash
cp -r modules/orchestration/multi-agent-init ~/.claude/skills/multi-agent-init
```

安装后在项目中说"初始化多智能体"或运行 `/multi-agent-init`。

### 方式二：CLI 独立运行

```bash
# 获取工具
git clone https://github.com/grimoire-works/multi-agent.git
cd multi-agent
npm install
npm run build

# 在目标项目中初始化（探测项目 → 选角色 → AI 生成任务计划）
cd ~/my-project
node /path/to/multi-agent/dist/index.js init

# 审查 doc/plan.md 后启动编排
node /path/to/multi-agent/dist/index.js run

# 查看进度
node /path/to/multi-agent/dist/index.js status
```

**并行模式**（可选）：在 `.multi-agent/config.json` 中开启，无文件冲突的任务将并行开发：

```json
{
  "orchestration": {
    "parallel": true,
    "maxCorrectionRounds": 3,
    "agentModel": "claude-sonnet-4-5-20250514",
    "agentTimeoutMs": 600000
  }
}
```

## Agent 角色说明

| 角色 | 文件 | 职责 | CLI 编排是否调度 |
|------|------|------|----------------|
| 核心开发 | `dev-agent.md` | 算法、业务逻辑、数据处理 | ✅ |
| 质量测试 | `tester-agent.md` | AC 验证 + 代码审查 + 测试报告 | ✅ |
| 前端开发 | `frontend-agent.md` | 页面、组件、动画、主题 | 按需手动调度（不进编排循环） |
| 产品经理 | `pm-agent.md` | 需求分析、任务拆解、PRD | Skill 路径的上游流程使用 |
| UI 设计师 | `designer-agent.md` | 界面方案、交互规范、视觉标准 | Skill 路径的上游流程使用 |

## 工作流

```
初始化（Skill：/multi-agent-init ｜ CLI：multi-agent-kit init）
  │
  ├─ 探测项目信息 → 确认/补充
  ├─ 选择 Agent 角色
  ├─ AI 扫描代码 → 生成 plan.md（任务 + 验收标准）
  ├─ 生成 .claude/agents/ 角色定义 + 编排提示词
  └─ 注入协作原则 principles.md
  │
编排执行（Skill：说"走编排流程" ｜ CLI：multi-agent-kit run）
  │
  ├─ 逐任务（或 Wave 并行）循环：
  │   ├─ 分级注入项目规则 + 相关经验（≤5 条，写注入日志）
  │   ├─ dev Agent 开发
  │   ├─ 构建检查（失败自动修复一次）
  │   ├─ tester Agent 验收（AC 逐条验证）
  │   ├─ PASS → 下一任务
  │   └─ FAIL → 修正循环（最多 3 轮，报告按 task-{N}-r{round}.md 留痕）
  │
  ├─ 全部完成 → 统计报告
  └─ 可选：/learn 经验复盘（在 Claude Code 中）→ 评分/提升/归档
```

## 产出文件

| 文件 | 作用 | 哪条路径产出 |
|------|------|------------|
| `.claude/agents/{代号}-*.md` | Agent 角色定义 | 两条路径（CLI init 同样生成） |
| `.claude/主智能体提示词.md` | 串行编排 prompt | 两条路径 |
| `.claude/主智能体提示词-teams.md` | 并行编排 prompt | 两条路径 |
| `.claude/rules/principles.md` | 通用协作原则（P-001~P-006） | 两条路径 |
| `.claude/rules/{domain}-rules.md` | 项目规则（从高置信度经验提升） | Skill（/learn） |
| `.multi-agent/config.json` | CLI 编排配置 | CLI |
| `doc/plan.md` | 任务列表 + 验收标准 | 两条路径 |
| `doc/lessons-learned.md` | 经验教训库（结构化格式 v2） | 两条路径 |
| `doc/lessons-archive.md` | 归档经验（衰减/合并后移入） | Skill（/learn） |
| `doc/main-log.md` | 编排日志 + 经验注入日志（/learn 统计数据源） | 两条路径 |
| `doc/test-reports/task-{N}-r{round}.md` | 测试报告（按轮次留痕） | 两条路径 |
| `doc/handoff.md` | 中断交接文档 | Skill |

## 开发本工具

```bash
npm install
npm run build    # tsc 编译到 dist/
npm test         # vitest 单元测试（plan 解析/Wave 分组/经验注入/判定提取，模板契约已固化为测试）
```

## License

MIT
