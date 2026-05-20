import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProjectConfig, Task, AgentRole } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../skills/orchestration/multi-agent-init/templates');

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
export function buildTesterPrompt(task: Task): string {
  const lines: string[] = [
    `测试任务：任务 ${task.id} - ${task.title}`,
  ];

  if (task.files.length > 0) {
    lines.push(`待测文件：${task.files.join(', ')}`);
  }

  lines.push('dev-plan: doc/plan.md');
  lines.push('项目架构: CLAUDE.md');
  lines.push('输出目录: doc/test-reports/');

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
export function buildRetestPrompt(task: Task): string {
  return [
    `开发者已修正代码（任务 ${task.id} - ${task.title}），请重新审查。`,
    '对上次 FAIL 的每个问题，逐一验证是否已修复。',
    '输出：追加到 doc/test-reports/ 中的测试报告。',
    '',
    '请按测试工作流程执行。',
  ].join('\n');
}

/**
 * 读取 lessons-learned.md 内容
 */
export function readLessonsLearned(projectDir: string): string {
  const filePath = path.join(projectDir, 'doc', 'lessons-learned.md');
  if (!fs.existsSync(filePath)) return '';

  const content = fs.readFileSync(filePath, 'utf-8');
  // 只取最近 5 条经验
  const lines = content.split('\n').filter(l => l.startsWith('- ['));
  return lines.slice(0, 5).join('\n');
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
3. 将项目拆分为合理的开发任务（每个任务 100-300 行代码量）
4. 为每个任务定义 3-5 条可执行的验收标准

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
| 1 | {任务名} | ⏳ 待办 | \`{文件路径}\` | 见 AC-1 | |
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
4. **拆分任务**：按功能模块拆分，遵循：
   - 单一职责：每个任务只做一件事
   - 可测试性：每个任务有明确的验收标准
   - 依赖顺序：先基础设施，后业务功能
   - 粒度适中：一个任务约 100-300 行代码量
5. **定义 AC**：每条 AC 格式为"操作 → 期望结果"，必须可执行、可验证
6. **写入文件**：使用 Write 工具写入 doc/plan.md

## 注意事项

- 涉及文件列必须填写具体路径，用反引号包裹
- 验收标准列填"见 AC-N"并在 AC 段落中定义
- 任务 0 始终是"环境验证 + 编译检查"
- 不要假设不存在功能，基于实际代码拆分
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
