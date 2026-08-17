import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProjectConfig, Task, AgentRole } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../modules/orchestration/multi-agent-init/templates');

/**
 * Agent prompt 文件名映射
 */
const AGENT_PROMPT_MAP: Record<AgentRole, string> = {
  dev: 'dev-agent.md',
  tester: 'tester-agent.md',
  frontend: 'frontend-agent.md',
  pm: 'pm-agent.md',
  designer: 'designer-agent.md',
};

/**
 * 从 prompts/ 目录加载原始 prompt 模板
 */
export function loadPrompt(role: AgentRole): string {
  const filename = AGENT_PROMPT_MAP[role];
  const filepath = path.join(TEMPLATES_DIR, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Prompt 文件不存在: ${filepath}`);
  }

  return fs.readFileSync(filepath, 'utf-8');
}

/**
 * 替换 prompt 中的占位符
 */
export function replacePlaceholders(template: string, config: ProjectConfig): string {
  return template
    .replace(/\{项目名称\}/g, config.name)
    .replace(/\{代号\}/g, config.codename)
    .replace(/\{源代码目录\}/g, config.sourceDir)
    .replace(/\{构建命令\}/g, config.buildCommand ?? '（未配置）')
    .replace(/\{依赖安装命令\}/g, config.installCommand ?? '（未配置）')
    .replace(/\{项目路径\}/g, config.projectPath);
}

/**
 * 加载并替换占位符后的 agent system prompt
 */
export function loadAgentPrompt(role: AgentRole, config: ProjectConfig): string {
  const template = loadPrompt(role);
  return replacePlaceholders(template, config);
}

/**
 * 构建开发任务的 user prompt
 */
export function buildDevPrompt(task: Task, lessonsLearned: string): string {
  const lines: string[] = [
    `开发任务：任务 ${task.id} - ${task.title}`,
  ];

  if (task.description) {
    lines.push(`需求：${task.description}`);
  }

  lines.push('dev-plan: doc/plan.md');
  lines.push('项目架构: CLAUDE.md');

  // AC 注入
  if (task.acceptanceCriteria.length > 0) {
    lines.push('');
    lines.push('验收标准：');
    for (const ac of task.acceptanceCriteria) {
      lines.push(`- ${ac.operation} → ${ac.expected}`);
    }
  }

  // 涉及文件
  if (task.files.length > 0) {
    lines.push('');
    lines.push(`涉及文件：${task.files.join(', ')}`);
  }

  // 经验注入
  if (lessonsLearned.trim()) {
    lines.push('');
    lines.push('近期项目经验（开发时请注意避免）：');
    lines.push(lessonsLearned);
  }

  lines.push('');
  lines.push('请按开发模式工作流程执行。');

  return lines.join('\n');
}

/**
 * 构建测试任务的 user prompt
 */
export function buildTesterPrompt(task: Task, reportRelPath: string): string {
  const lines: string[] = [
    `测试任务：任务 ${task.id} - ${task.title}`,
  ];

  if (task.files.length > 0) {
    lines.push(`待测文件：${task.files.join(', ')}`);
  }

  lines.push('dev-plan: doc/plan.md');
  lines.push('项目架构: CLAUDE.md');
  lines.push(`输出文件：${reportRelPath}   ← 必须用此文件名`);

  // AC 注入
  if (task.acceptanceCriteria.length > 0) {
    lines.push('');
    lines.push('验收标准（逐条验证）：');
    for (const ac of task.acceptanceCriteria) {
      lines.push(`- [${ac.id}] ${ac.operation} → ${ac.expected}`);
    }
  }

  lines.push('');
  lines.push('请按测试工作流程执行。');

  return lines.join('\n');
}

/**
 * 构建修正循环的 user prompt
 */
export function buildCorrectionPrompt(
  task: Task,
  reportPath: string,
  lessonsLearned: string,
  round: number,
): string {
  const lines: string[] = [
    `测试反馈如下（第 ${round} 轮修正），请读取报告并修正：`,
    `测试报告：${reportPath}`,
  ];

  // 经验注入
  if (lessonsLearned.trim()) {
    lines.push('');
    lines.push('历史经验提示（请优先关注）：');
    lines.push(lessonsLearned);
  }

  lines.push('');
  lines.push('请按以下步骤操作：');
  lines.push('1. 读取测试报告，理解每个问题的严重等级和修改建议');
  lines.push('2. 在源代码中定位对应位置');
  lines.push('3. 按严重等级从高到低依次修正');
  lines.push('4. 运行构建命令自检');
  lines.push('5. 修正完成后更新 doc/lessons-learned.md');
  lines.push('');
  lines.push('修正完成后简短确认即可。');

  return lines.join('\n');
}

/**
 * 构建重测的 user prompt
 */
export function buildRetestPrompt(task: Task, prevReportRelPath: string, reportRelPath: string): string {
  return [
    `开发者已修正代码（任务 ${task.id} - ${task.title}），请重新审查。`,
    `上轮报告：${prevReportRelPath}`,
    `输出文件：${reportRelPath}   ← 必须用此文件名，禁止覆盖其他 round 的报告`,
    '对上次 FAIL 的每个问题，逐一验证是否已修复。',
    '',
    '请按测试工作流程执行。',
  ].join('\n');
}

/**
 * 读取 lessons-learned.md 内容（v2 结构化格式，取最近 5 条）
 */
export function readLessonsLearned(projectDir: string): string {
  const filePath = path.join(projectDir, 'doc', 'lessons-learned.md');
  if (!fs.existsSync(filePath)) return '';

  const content = fs.readFileSync(filePath, 'utf-8');

  // v2 格式：`### EXP-NNN: 标题` 分段，新条目追加在文件末尾，取最后 5 条
  const sections = content.split(/^###\s+(?=EXP-\d+)/m).filter(s => s.startsWith('EXP-'));
  if (sections.length > 0) {
    return sections.slice(-5).map(section => {
      const lines = section.split('\n');
      const header = lines[0].trim();
      const trigger = lines.find(l => l.includes('触发条件'))?.trim();
      const reason = lines.find(l => l.startsWith('**原因**'))?.trim();
      const solution = lines.find(l => l.startsWith('**解法**'))?.trim();
      return [header, trigger, reason, solution].filter(Boolean).join('\n');
    }).join('\n\n');
  }

  // 旧版列表格式兼容：`- [xxx]` 行
  const lines = content.split('\n').filter(l => l.startsWith('- ['));
  return lines.slice(-5).join('\n');
}

/**
 * 构建 planner 的 system prompt（AI 扫描代码库生成 plan.md）
 */
export function buildPlannerSystemPrompt(config: ProjectConfig): string {
  return `# 任务规划器

你是一位资深的技术架构师，负责扫描现有代码库并生成结构化的开发任务计划。

## 你的职责

1. 使用 Glob、Read、Grep 工具扫描项目代码结构
2. 分析代码组织、模块划分、依赖关系
3. 将项目拆分为**细粒度**的开发任务（每个任务 30-150 行代码量）
4. 为每个任务定义 1-3 条可执行的验收标准（**最多 3 条**）

## 输出格式

你必须生成一个完整的 Markdown 文件，使用 Write 工具写入 \`doc/plan.md\`，格式如下：

\`\`\`markdown
# 开发计划 — ${config.name}

## 项目概述
{一句话描述项目}

## 任务列表
| # | 任务 | 状态 | 涉及文件 | 验收标准 | 备注 |
|---|------|------|----------|----------|------|
| 0 | 环境验证 + 编译检查 | ⏳ 待办 | - | 构建命令零错误 | 基础任务 |
| 1 | {任务名} | ⏳ 待办 | \`{文件路径}\` | 见 AC-1 | 任务粒度：30-150 行 / 1-3 AC / ≤3 文件 |
| ... | ... | ... | ... | ... | ... |

## 验收标准

### AC-1: {任务1标题}
1. {操作描述} → {期望结果}
2. {操作描述} → {期望结果}
3. {操作描述} → {期望结果}

### AC-2: {任务2标题}
1. {操作描述} → {期望结果}
...

## 当前进度
- 正在执行：尚未开始
- 已完成：0/{任务总数}
\`\`\`

## 工作步骤

1. **扫描结构**：用 Glob 列出源码目录所有文件，了解项目组织
2. **读取关键文件**：Read 入口文件、配置文件、核心模块，理解项目功能
3. **搜索模式**：用 Grep 了解关键类/函数/接口的分布
4. **拆分任务**：按功能模块拆分，遵循以下硬约束：
   - **单一职责**：一个任务 = 一个用户可感知的能力 OR 一个独立技术变更（不能混合多个无关改造）
   - **AC 上限**：每任务 1-3 条 AC，超过 3 条**必须**拆分为多个任务（这是硬性要求，不是建议）
   - **代码量上限**：单任务 30-150 行，超过 150 行的复杂改造必须按 AC 边界拆分
   - **文件数上限**：单任务涉及文件 ≤ 3 个；若一个逻辑功能必然涉及更多文件，按子功能拆为多个任务
   - **可测试性**：每个任务有明确的、可独立验证的验收标准
   - **依赖顺序**：先基础设施，后业务功能；同一文件的改造必须串行（避免合并冲突）
5. **拆分反模式**（必须避免）：
   - ❌ "Task N：X 功能的配套改造"（把多个无关子改造塞一个任务）→ 按子改造拆为多个独立任务
   - ❌ "Task N：底层重构 + 业务适配 + 兼容处理"（多个技术变更混合）→ 按变更类型拆
   - ❌ "Task N：完整 X 功能"（横跨多个层次：入口 / 业务逻辑 / 数据 / 测试）→ 按层次拆
   - ✅ 拆分维度参考：
     - 按**层次**：入口层（CLI/UI/API 边界）/ 业务逻辑层 / 数据层 / 基础设施层
     - 按**子能力**：独立可验收的功能切片
     - 按**技术变更类型**：新增模块 / 修改数据结构 / 修改对外接口 / 修改业务流程 / 修改约束（如权限/校验）
   - ✅ 单一原则：一个任务只在一个层次或一种技术变更上做事
6. **定义 AC**：每条 AC 格式为"操作 → 期望结果"，必须可执行、可验证
7. **写入文件**：使用 Write 工具写入 doc/plan.md

## 注意事项

- 涉及文件列必须填写具体路径，用反引号包裹
- 验收标准列填"见 AC-N"并在 AC 段落中定义
- 任务 0 始终是"环境验证 + 编译检查"
- 不要假设不存在功能，基于实际代码拆分
- **优先拆细**：宁可生成 20 个细任务，也不要 5 个粗任务。细任务执行快、失败定位准、可并行度高
- **God File 处理**：若发现项目存在单文件超大（如核心入口文件 / 主控制器），在拆任务时主动考虑按功能域拆分该文件（按职责切成多个子文件），不同子文件由不同任务负责，避免所有任务都改同一文件导致无法并行
- 写入完成后简短确认即可`;
}

/**
 * 构建 planner 的 user prompt
 */
export function buildPlannerUserPrompt(config: ProjectConfig): string {
  const parts = [
    `请扫描项目并生成开发计划。`,
    ``,
    `项目信息：`,
    `- 名称：${config.name}`,
    `- 语言：${config.language}`,
  ];

  if (config.framework) {
    parts.push(`- 框架：${config.framework}`);
  }
  parts.push(`- 源码目录：${config.sourceDir || '请自行探测'}`);

  if (config.buildCommand) {
    parts.push(`- 构建命令：${config.buildCommand}`);
  }

  parts.push('');
  parts.push('请按步骤执行：扫描代码 → 分析结构 → 拆分任务 → 定义 AC → 写入 doc/plan.md');

  return parts.join('\n');
}
