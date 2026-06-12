# multi-agent-kit

一套跨平台的多智能体开发工作流 prompt 套件。为任意项目配置开发-测试编排体系，支持从已有项目启动。

## 核心理念

- **5 种 Agent 角色**：核心开发 / 质量测试 / 前端开发 / 产品经理 / UI 设计师，按需组合
- **编排模式**：主智能体只调度不干活，全部委托给子 Agent
- **验收标准驱动**：每个任务定义可执行的验收条件，tester 逐条验证
- **经验积累**：lessons-learned 自动注入后续任务，支持结构化经验、衰减归档、进化管道（经验 → 项目规则 → 全局规则）
- **流水线执行**：开发前台 + 测试后台并行，任务级流水线

## 项目结构

```
multi-agent-kit/
├── modules/                               # 能力模块（按功能域分类）
│   ├── CONTEXT.md                         # 共享领域语言
│   ├── orchestration/                     # 编排类
│   │   └── multi-agent-init/              # 多智能体初始化模块
│   │       ├── SKILL.md                   # 模块入口定义
│   │       ├── templates/                 # Agent 模板（CLI + Skill 共用）
│   │       │   ├── dev-agent.md
│   │       │   ├── tester-agent.md
│   │       │   ├── frontend-agent.md
│   │       │   ├── pm-agent.md
│   │       │   ├── designer-agent.md
│   │       │   ├── orchestrator.md
│   │       │   └── orchestrator-teams.md
│   │       └── references/               # 扩展参考文档
│   ├── engineering/                       # 工程类
│   │   └── diagnose/                      # 纪律性调试模块
│   │       └── SKILL.md
│   └── productivity/                      # 生产力类
│       ├── grill/                         # 诘问式对话模块
│       │   └── SKILL.md
│       └── learn/                         # 经验复盘模块
│           └── SKILL.md
│
├── src/                                   # CLI 独立运行时
│   ├── index.ts
│   ├── commands/
│   ├── core/
│   └── types/
│
├── adapters/                              # 各平台适配层
│   ├── claude-code/
│   ├── cursor/
│   ├── trae/
│   └── codex/
│
├── package.json
├── tsconfig.json
└── README.md
```

## 快速开始

### 方式一：CLI 独立运行（推荐）

适用于所有平台用户，不依赖 Claude Code。

```bash
# 获取工具
git clone https://github.com/xxx/multi-agent-kit.git
cd multi-agent-kit
npm install
npm run build

# 在项目中初始化
cd ~/my-project
node /path/to/multi-agent-kit/dist/index.js init

# 编辑 doc/plan.md 添加任务和验收标准

# 启动编排
node /path/to/multi-agent-kit/dist/index.js run

# 查看进度
node /path/to/multi-agent-kit/dist/index.js status
```

**环境要求**：
- Node.js 18+
- 设置 `ANTHROPIC_API_KEY` 环境变量

### 方式二：Claude Code Skill

适用于 Claude Code 用户，支持完整功能。可通过以下任一方式安装：

**从云社区安装**（推荐）：

直接从云社区搜索 `multi-agent-init` 一键安装。

**从本项目安装**：

```bash
cp -r modules/orchestration/multi-agent-init ~/.claude/skills/multi-agent-init
```

或使用安装脚本：

```bash
cd adapters/claude-code
bash install.sh
```

安装后在项目中说"初始化多智能体"或运行 `/multi-agent-init`。

支持的完整功能：
- 自动编排（开发 → 测试 → 修正循环）
- 流水线模式（测试后台 + 开发前台）
- Agent Teams 并行模式（>10 个任务）
- resume 修正循环（复用同一个 agent）

### 方式三：Cursor / Trae / Codex

使用 CLI 初始化后，运行 setup 命令自动生成平台规则文件：

```bash
# init 完成后会询问是否生成，也可以单独运行：
node /path/to/multi-agent-kit/dist/index.js setup
# → 选择目标平台 → 自动替换占位符 → 生成到对应 rules 目录
```

生成后在对应平台的对话中说"按开发模式工作流程执行"即可使用。

支持基础功能：
- Agent 角色定义（dev/tester/...）
- plan.md 任务管理 + 验收标准
- lessons-learned 经验积累
- tester AC 验证 + 代码质量审查

## Agent 角色说明

| 角色 | 文件 | 职责 |
|------|------|------|
| 核心开发 | `dev-agent.md` | 算法、业务逻辑、数据处理 |
| 质量测试 | `tester-agent.md` | AC 验证 + 代码审查 + 测试报告 |
| 前端开发 | `frontend-agent.md` | 页面、组件、动画、主题 |
| 产品经理 | `pm-agent.md` | 需求分析、任务拆解、PRD |
| UI 设计师 | `designer-agent.md` | 界面方案、交互规范、视觉标准 |

## 工作流

```
初始化 (multi-agent-kit init)
  │
  ├─ 探测项目信息 → 确认/补充
  ├─ 选择 Agent 角色
  ├─ AI 扫描代码 → 生成 plan.md（含验收标准）
  ├─ 可选：setup 生成平台规则文件
  │
编排执行 (multi-agent-kit run)
  │
  ├─ 逐任务循环：
  │   ├─ 注入项目规则 + 相关经验（≤5条）
  │   ├─ dev Agent 开发
  │   ├─ tester Agent 验收（AC 逐条验证）
  │   ├─ PASS → 下一个任务
  │   └─ FAIL → 修正循环（最多 3 轮）
  │
  ├─ 全部完成 → 统计报告
  └─ 可选：/learn 经验复盘 → 评分/提升/归档
```

## 产出文件

| 文件 | 作用 |
|------|------|
| `.claude/agents/{代号}-*.md` | Agent 角色定义 |
| `.claude/主智能体提示词.md` | 串行编排 prompt |
| `.claude/主智能体提示词-teams.md` | 并行编排 prompt |
| `.claude/rules/{domain}-rules.md` | 项目规则（从高置信度经验提升） |
| `doc/plan.md` | 任务列表 + 验收标准 |
| `doc/lessons-learned.md` | 经验教训库（结构化格式 v2） |
| `doc/lessons-archive.md` | 归档经验（衰减/合并后移入） |
| `doc/main-log.md` | 编排日志 |
| `doc/test-reports/` | 测试报告目录 |

## License

MIT
