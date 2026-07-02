# Harness 设计 Lessons — 维护者参考

> 本文件记录 **multi-agent-kit harness 设计过程中踩过的坑 + 学到的设计原则**。
>
> ❌ **不进入 agent prompt**：这些是给 harness 维护者看的元教训，约束**如何设计 agent 协作系统**，不是约束 agent 本身。
>
> ✅ 当你修改 `templates/` / `src/core/prompt-loader.ts` / `install.sh` 等 harness 核心文件时，先读一遍这份文档。

---

## L-001：Agent 是运行时进程，不持久化

**核心概念**：Claude Code 的 agent 是运行时进程，不是持久化对象。同步启动完成后进程结束；后台启动完成后进入 idle，主 Agent 退出时跟随死亡。

### 关键事实

| 行为 | 真相 |
|---|---|
| 同步启动的 agent（`Agent(...)`） | 完成首轮任务后进程结束，**无法再被唤醒** |
| 后台启动的 agent（`run_in_background: true`） | 完成首轮后 idle，可被 `SendMessage(to: name)` 唤醒；主 Agent 退出时跟随死亡 |
| `agentId`（session ID） | 只是会话内临时标识符，**不是 agent 身份证**，不能跨进程唤醒 |
| `Agent(resume: agentId)` | **Claude Code 不提供此 API**。要"再次调用"agent，必须新启动 |

### 常见错误假设

| 错误假设 | 真相 |
|---|---|
| ❌ 上次的 agent ID 能唤醒已完成的 agent | agent 进程已结束，ID 无意义 |
| ❌ handoff.md 保存 DEV_ID/TEST_ID 就能恢复 | ID 不能恢复 agent |
| ❌ SendMessage 找不到目标会报错 | **静默失败**，主 Agent 卡住或直接结束 |
| ❌ 多轮讨论型 agent 同步启动后能等用户回答 | 同步启动 = 一次性进程，立刻结束 |

### 正确做法

**多轮讨论型 agent**（PM / Designer）：必须 `run_in_background: true` + `name` 启动，进入 idle 后用 `SendMessage(to: name)` 协作。

**一次性任务型 agent**（dev / tester）：同步启动即可，每次需要时新开。

**断点恢复**：agent 是运行时进程，handoff.md 恢复时不保存 agent 状态（无法恢复），只保存文件状态（任务进度 / pending_tests）。新会话需要 agent 时**主动重启**，让 agent 通过读文件（PRD / plan.md / 测试报告）恢复上下文。

### 设计原则沉淀

> **Agent 是无状态的运行时单元，文件是有状态的持久化载体。**
>
> 设计协作系统时，永远让 agent 从文件读上下文，不要让 agent 之间依赖运行时状态衔接。

---

## L-002：审查 prompt 系统必须端到端走，不能只看 diff

**触发场景**：在 multi-agent-kit 项目审查中，第一轮检查发现 8 个表面 bug（编号重复、命名不一致等），用户要求「再检查是否有流程上的 bug」，第二轮发现 10 个流程逻辑 bug。

### 根本原因

**diff 视角的盲区**：

```
Round 1：看「改了什么」
  ↓ 只检查改动段落本身是否正确
  ↓ 看不到「改动之间的相互影响」
  ↓ 漏掉所有「跨段落矛盾」类 bug
```

例子（F-001：流水线 vs 后台限制矛盾）：

```
要发现这个 bug 必须：
1. 看到「Step 4 启动测试（后台）」   ← line 256
2. 看到「tester 后台并行限制」       ← line 525
3. 把两个对比 → 发现矛盾

diff 模式只看其中一段，无法发现矛盾。
```

### 错误假设（曾经的审查方法）

| 错误假设 | 真相 |
|---|---|
| ❌ diff 模式能发现所有问题 | ❌ 跨段落矛盾 diff 看不到 |
| ❌ 每个段落写对 = 流程正确 | ❌ 段落之间可能逻辑死锁 |
| ❌ 扫一遍就够 | ❌ 必须按场景端到端走 |
| ❌ 凭直觉报问题 | ❌ 系统化按场景跑更可靠 |

### 正确做法

**三层审查法**：

```
Round 1：文档表面
  - 编号、命名、措辞、格式
  - diff 模式 + 段落内自洽

Round 2：端到端走流程
  - 启动场景：fresh init / 断点恢复 / 需求迭代
  - 编排场景：流水线正常 / 任务 FAIL / 后台 tester 累积
  - 修正场景：单任务修正 / 修正循环触发 / 修正循环 FAIL
  - 异常场景：PM 无响应 / tester 限流 / handoff 中断

Round 3：跨段落对比
  - 「Step 4 后台」 vs 「后台并行限制」
  - 「修正循环代码」 vs 「修正循环描述」
  - 「Step -1 流程」 vs 「Step 0 统计语义」
```

**口诀**：**「跑一遍」比「读一遍」更能发现问题。**

### 设计原则沉淀

> 审查 prompt 系统时，必须按场景端到端走，不能只看 diff。
>
> 改动看起来局部正确，但放在完整流程里可能跟其他段落矛盾。**端到端跑 + 跨段落对比**比凭直觉扫更可靠。

### 在审查流程中的应用

每次完成 prompt 改动后，强制走三层审查：
1. Round 1：diff 视角扫表面
2. Round 2：在脑里端到端跑流程
3. Round 3：列所有「跨段落概念」（如「后台」「idle」「修正」），找同一段落内的不同表述

---

## 后续 Lessons 索引

按需追加（沿用 lessons-learned.md 的 EXP-NNN 结构，但编号用 L-NNN 表示 harness 设计层面）：

- L-001：Agent 是运行时进程，不持久化
- L-002：审查 prompt 系统必须端到端走
- L-003：...（待积累）
