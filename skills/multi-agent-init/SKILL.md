---
name: multi-agent-init
description: "Initialize a multi-agent development system for any project. Auto-detects language/framework, creates agent templates based on user selection, orchestrator prompt, and project documentation structure. Trigger: user says 'initialize multi-agent system' or runs /multi-agent-init."
---

# Multi-Agent Init Skill

Initialize a multi-agent development system for the current project. Auto-detects project info, lets user choose agents, fills in placeholders, creates all files.

Supports two modes:
- **全新初始化**：项目首次使用，生成全部所需文件
- **增量添加**：已有部分 Agent，只生成新增的，不覆盖已有文件

## Activation

User says any of:
- "初始化多智能体系统"
- "初始化多智能体"
- "添加智能体"
- "/multi-agent-init"
- "/multi-agent-init dev tester"（带参数，直接指定要生成的 Agent）

## 参数解析

Skill 支持命令行参数，格式：`/multi-agent-init [agent1] [agent2] ...`

支持的参数值（不区分大小写）：

| 参数 | 对应 Agent |
|------|-----------|
| `dev` | 核心开发 |
| `tester` | 质量测试 |
| `frontend` | 前端开发 |
| `pm` | 产品经理 |
| `designer` | UI设计师 |

**有参数时**：直接使用参数指定的 Agent 列表，**跳过 AskUserQuestion 选择步骤**（Step 2 跳过）。

**无参数时**：走交互式选择流程（Step 2）。

示例：
```
/multi-agent-init dev tester          → 只生成 dev + tester
/multi-agent-init pm designer         → 只生成 pm + designer（增量添加到已有系统）
/multi-agent-init                     → 弹出交互选择界面
```

## Step 0：检测已有状态

在探测项目信息之前，先扫描是否已有智能体文件：

```bash
ls .claude/agents/*.md 2>/dev/null
ls .claude/主智能体提示词.md 2>/dev/null
ls doc/plan.md 2>/dev/null
```

从已有文件名推断项目代号：提取任意 `{代号}-xxx.md` 中 `-` 前的部分（如 `tuner-dev.md` → 代号 `tuner`）。

根据扫描结果判断模式：

| 已有文件 | 模式 | 说明 |
|---------|------|------|
| 无任何 agent 文件 | 全新初始化 | 执行完整流程 Step 1-7 |
| 有部分 agent 文件 | 增量添加 | 只生成新增 Agent + 更新 orchestrator 和 CLAUDE.md |
| 已有全部所选 agent | 提示已存在 | 告知用户无需重复生成 |

## Step 1：探测项目信息

### 前置检查

先确认项目目录中是否存在源代码文件：

```bash
ls {检查是否有源码文件，如 lib/ src/ app/ pages/ 目录，或 *.ts *.py *.java *.dart *.go *.rs 等源文件}
```

- **有源码** → 继续、探测项目信息
- **无源码（空项目）** → **停止**，告知用户：`当前项目目录中未检测到源代码，本 skill 适用于已有代码的项目。请先创建项目骨架（如 npm init / flutter create / mvn archetype:generate）后再运行 /multi-agent-init。`

### 探测逻辑

自己读文件判断，不问用户：

| 信息 | 探测方式 |
|------|----------|
| 项目名称 | 读 pubspec.yaml / package.json / pom.xml / setup.py / Cargo.toml 的 name 字段，取不到则用目录名 |
| 语言 | 从源文件后缀判断（.dart→Dart, .ts/.tsx→TypeScript, .js→JavaScript, .java→Java, .py→Python, .go→Go, .rs→Rust） |
| 框架 | 从依赖判断（flutter→Flutter, react→React, vue→Vue, spring-boot→Spring Boot, django→Django, next→Next.js, nuxt→Nuxt） |
| 源代码目录 | ls 根目录找 lib/ src/ app/ pages/ 等 |
| 构建命令 | Flutter→`~/flutter/bin/flutter analyze`, npm→`npm run build`, mvn→`mvn compile`, 其他→根据框架推断 |
| 测试命令 | Flutter→`~/flutter/bin/flutter test`, npm→`npm test`, mvn→`mvn test`, 其他→根据框架推断 |
| 依赖安装命令 | Flutter→`~/flutter/bin/flutter pub get`, npm→`npm install`, pip→`pip install -r requirements.txt`, 其他→根据框架推断 |
| 项目路径 | pwd |
| 项目代号 | 增量模式从已有文件名推断；全新模式从项目名称取简短英文代号（小写），如 guitar-tuner→tuner, my-shop→shop, blog-api→blog |

### 确认与补充（必须执行）

探测完成后，**必须**用 AskUserQuestion 展示探测结果供用户确认：

```json
{
  "AskUserQuestion": {
    "questions": [{
      "question": "项目信息探测结果：\n- 项目名称：{结果}\n- 语言：{结果}\n- 框架：{结果 / ⚠️ 未检测到}\n- 源代码目录：{结果}\n- 构建命令：{结果 / ⚠️ 未检测到}\n- 测试命令：{结果 / ⚠️ 未检测到}\n- 依赖安装命令：{结果 / ⚠️ 未检测到}\n- 项目代号：{结果}\n\n以上信息是否正确？",
      "header": "确认信息",
      "multiSelect": false,
      "options": [
        {"label": "确认无误", "description": "使用以上探测结果继续"},
        {"label": "需要补充或修改", "description": "手动修正部分字段"}
      ]
    }]
  }
}
```

- 用户选择 **"确认无误"** → 直接使用探测结果，继续 Step 2
- 用户选择 **"需要补充或修改"** → 追问用户要修改哪些字段及新值，更新探测结果后继续
- 有字段显示 **⚠️ 未检测到** → 提示用户通过"其他"手动输入该字段的值

## Step 2：确定要生成的智能体

### 有命令行参数时

如果用户通过 `/multi-agent-init dev tester` 传了参数，直接解析参数为 Agent 列表，**跳过下面的交互选择**，直接进入 Step 3。

### 无参数时：交互选择

### 增量模式

已有 Agent 不出现在选项中（或标记为 ✅ 不可选），只让用户选**缺少的角色**。

执行逻辑：
1. 扫描 `.claude/agents/` 得到已有 Agent 列表
2. 从 5 个角色中减去已有的，得到可新增列表
3. 如果可新增列表为空 → 告知用户"所有 Agent 已存在，无需重复生成"，结束
4. 如果可新增列表 ≤4 个 → 一个 AskUserQuestion 搞定
5. 如果可新增列表 = 5 个 → 拆成两个问题（同全新模式的写法）

示例（已有 dev + tester，可新增 frontend / pm / designer）：
```json
{
  "AskUserQuestion": {
    "questions": [{
      "question": "已检测到已有 Agent：tuner-dev ✅ / tuner-tester ✅\n请选择要新增的智能体（可多选）：",
      "header": "新增Agent",
      "multiSelect": true,
      "options": [
        {"label": "frontend 前端开发", "description": "页面、组件、动画、主题等 UI 层开发"},
        {"label": "pm 产品经理", "description": "需求分析、任务拆解、输出 PRD 文档"},
        {"label": "designer UI设计师", "description": "界面设计方案、交互规范、视觉标准"}
      ]
    }]
  }
}
```

### 全新模式或选项展示

拆分为两个问题（AskUserQuestion 最多 4 个选项）：

**问题1：开发测试类**
```json
{
  "AskUserQuestion": {
    "questions": [{
      "question": "请选择开发测试类智能体（可多选）：",
      "header": "开发类",
      "multiSelect": true,
      "options": [
        {"label": "dev 核心开发（推荐）", "description": "算法、业务逻辑、数据处理等核心代码开发"},
        {"label": "tester 质量测试（推荐）", "description": "代码审查 + 静态分析 + PASS/FAIL 测试报告"},
        {"label": "frontend 前端开发", "description": "页面、组件、动画、主题等 UI 层开发"}
      ]
    }]
  }
}
```

**问题2：规划设计类**
```json
{
  "AskUserQuestion": {
    "questions": [{
      "question": "请选择规划设计类智能体（可多选，不选则跳过）：",
      "header": "规划类",
      "multiSelect": true,
      "options": [
        {"label": "pm 产品经理", "description": "需求分析、任务拆解、输出 PRD 文档"},
        {"label": "designer UI设计师", "description": "界面设计方案、交互规范、视觉标准"}
      ]
    }]
  }
}
```

如果用户一个都没选，提示至少选一个。

## Step 3：创建目录

```bash
mkdir -p .claude/agents
mkdir -p doc/test-reports
```

如果用户选了 designer，额外创建：
```bash
mkdir -p doc/design
```

增量模式下，如果目录已存在则跳过（mkdir -p 天然幂等）。

## Step 4：读取模板并替换占位符

根据用户选择，只读取和生成对应的模板文件。

### 增量模式关键规则

- **已有文件不覆盖**：如果 `{代号}-dev.md` 已存在，即使选了 dev 也跳过，提示"已存在，跳过"
- **只生成新增的**：只读取和写入缺少的模板文件
- **始终更新**：`主智能体提示词.md`（因为 Agent 组合变了，编排逻辑需要同步）

### 可用模板映射

| 用户选择 | 模板文件 | 输出路径 |
|----------|---------|---------|
| dev 核心开发 | `templates/dev-agent.md` | `.claude/agents/{代号}-dev.md` |
| tester 质量测试 | `templates/tester-agent.md` | `.claude/agents/{代号}-tester.md` |
| frontend 前端开发 | `templates/frontend-agent.md` | `.claude/agents/{代号}-frontend.md` |
| pm 产品经理 | `templates/pm-agent.md` | `.claude/agents/{代号}-pm.md` |
| designer UI设计师 | `templates/designer-agent.md` | `.claude/agents/{代号}-designer.md` |
| （始终生成/更新） | `templates/orchestrator.md` | `.claude/主智能体提示词.md` |
| （始终生成/更新） | `templates/orchestrator-teams.md` | `.claude/主智能体提示词-teams.md` |

### 占位符替换表

| 占位符 | 替换为 |
|--------|--------|
| `{项目名称}` | 探测到的项目名称 |
| `{代号}` | 项目代号 |
| `{源代码目录}` | 探测到的源码目录（如 lib/ src/） |
| `{构建命令}` | 探测到的构建命令 |
| `{依赖安装命令}` | 探测到的依赖安装命令 |
| `{项目路径}` | pwd 结果 |

### orchestrator 模板动态裁剪

生成 orchestrator 时，根据**所有已有 Agent + 新选 Agent 的合集**来调整内容：

1. 读取 `templates/orchestrator.md` 模板
2. 替换所有基础占位符
3. 在"任务执行循环"部分，根据完整 Agent 列表调整：
   - 如果有 dev → 保留 Step 1-4 的 dev 调度逻辑
   - 如果有 frontend → 在 Step 1 增加 frontend 调度选项
   - 如果有 tester → 保留测试步骤和修正循环
   - 如果没有 tester → 去掉测试步骤，开发完成后直接标记完成
   - 如果有 pm → 在任务循环前增加"可选：PM 规划"步骤
   - 如果有 designer → 在开发前增加"可选：Designer 出方案"步骤

## Step 5：创建配置和文档

### 增量模式

- `settings.local.json`：合并 permissions.allow 数组（不覆盖已有条目）
- `doc/plan.md`：**不覆盖**（已有任务进度）
- `doc/lessons-learned.md`：**不覆盖**（已有经验记录）
- `doc/main-log.md`：**追加**一行日志，如 `- {yymmdd hhmm} 增量添加 Agent: {新增列表}`

### 全新模式

### .claude/settings.local.json

```json
{
  "permissions": {
    "allow": [
      "Bash({构建命令}:*)",
      "Bash({测试命令}:*)",
      "Bash({依赖安装命令}:*)",
      "Bash(find ~/.claude/projects/:*)",
      "Bash(mkdir -p:*)"
    ]
  }
}
```

### doc/plan.md

**初始化时只生成空模板（仅含 Task 0 环境验证），不自动填充任务。** 具体开发任务由用户提供需求后，通过编排流程委托 PM Agent（`{代号}-pm`）分析拆解生成，或由用户手动填写。

**原因**：初始化阶段不应假设用户要做什么功能，任务规划应在用户明确需求后才进行。

空模板格式：

```markdown
# 开发计划 — {项目名称}

## 项目概述
{一句话描述}

## 任务列表
| # | 任务 | 状态 | DEV_ID | TEST_ID | 涉及文件 | 验收标准 | 备注 |
|---|------|------|--------|---------|----------|----------|------|
| 0 | 环境验证 + 编译检查 | ⏳ 待办 | - | - | - | 构建命令零错误 | 主Agent直接做 |

## 当前进度
- 正在执行：尚未开始
- 已完成：0/0
```

任务填写规范（供 PM Agent 或用户手动填写时参考）：
- 每个任务 100-300 行代码量
- 每个任务定义 3-5 条可执行的验收标准，格式为"操作 → 期望结果"（如"POST /api/register 合法参数 → 返回 201"）
- "涉及文件"列必须填写，用于 Wave 分组时的文件冲突检测。格式为逗号分隔的文件路径（如 `lib/core/audio/pitch.dart, lib/core/models/note.dart`）
- "验收标准"列填写"见 AC-N"并在下方 AC 段落中定义具体标准

### doc/lessons-learned.md

空文件，只写标题：`# 经验教训库`

### doc/main-log.md

写入：`- {yymmdd hhmm} 项目启动，{项目名称}`

## Step 6：更新 CLAUDE.md

### 增量模式

找到 CLAUDE.md 中的 `## 多智能体工作流` 章节，替换为包含所有 Agent（已有 + 新增）的新版本。

### 全新模式

在 CLAUDE.md 末尾追加。

### 追加内容格式（两种模式共用）

```markdown
## 多智能体工作流

本项目使用**主智能体编排 + 子Agent分工**的工作模式。

### 何时使用编排模式

**走编排流程的触发方式**（读 `.claude/主智能体提示词.md`，按流程执行）：
- 用户说"走编排流程"/"编排"/"开始执行"且 `doc/plan.md` 中有 ⏳ 任务
- 用户确认新功能/需求后（如"开始开发"、"方案OK，开始实施"等），**必须用 AskUserQuestion 询问**：
  > 检测到新需求已确认，是否进入编排模式？
  > - 是，走编排流程（委托子Agent开发+测试）
  > - 否，直接处理

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

然后根据所有 Agent（已有 + 新增），追加对应的 Agent 行：

```
{如果有 pm}       → - 需求规划 → 委托 `{代号}-pm` 子Agent
{如果有 designer}  → - UI 设计 → 委托 `{代号}-designer` 子Agent
{如果有 frontend} → - 前端开发 → 委托 `{代号}-frontend` 子Agent
{如果有 dev}      → - 核心开发 → 委托 `{代号}-dev` 子Agent
{如果有 tester}   → - 测试审查 → 委托 `{代号}-tester` 子Agent
```

公共文档行（始终包含）：
```
- 任务计划 → `doc/plan.md`（主Agent管理）
- 经验库 → `doc/lessons-learned.md`（开发Agent追加）
- 协调日志 → `doc/main-log.md`（主Agent编写）
{如果有 tester}    → - 测试报告 → `doc/test-reports/`（测试Agent写入）
{如果有 pm}       → - PRD 文档 → `doc/prd.md`（PM Agent写入）
{如果有 designer}  → - 设计方案 → `doc/design/`（designer Agent写入）
```

如果 CLAUDE.md 不存在，先运行 `/init` 创建。

### UI 开发规则（从 designer 模板提取）

当满足以下任一条件时，从 `templates/designer-agent.md` 中提取 `<!-- CLAUDE.md-rules -->` 之后的「项目级 UI 规则」内容，追加到 CLAUDE.md 末尾：

- 用户选了 designer 或 frontend Agent
- 项目检测到前端文件（`.vue` / `.tsx` / `.jsx` / `.dart` / `.svelte` / `.html`）

纯后端项目（无前端文件且未选前端相关 Agent）**不追加**。

提取方式：读取 `templates/designer-agent.md`，找到 `<!-- CLAUDE.md-rules -->` 标记，取标记后面的 `## 项目级 UI 规则` 整段内容，追加到目标项目的 CLAUDE.md。

## Step 7：验证环境

运行构建命令，确认零错误。

## 完成后输出

### 全新模式
```
多智能体系统已初始化完成：

项目：{名称} ({语言} + {框架})
已选Agent：{列出用户选择的Agent，如 tuner-dev / tuner-tester}
执行模式：Subagent 串行（默认） / Agent Teams 并行（见 .claude/主智能体提示词-teams.md）

任务数：待定（提需求后写入 doc/plan.md）
说"走编排流程"即可启动开发。

说"走编排流程"即可启动开发。
```

### 增量模式
```
智能体已增量更新：

新增：{新增的Agent列表，如 tuner-pm / tuner-designer}
已有（未变动）：{已有的Agent列表，如 tuner-dev / tuner-tester}
已更新：主智能体提示词.md / CLAUDE.md

说"走编排流程"即可启动开发。
```
