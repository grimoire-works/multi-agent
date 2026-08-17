import fs from 'fs';
import type { Task, AcceptanceCriterion, TaskStatus } from '../types/index.js';

/**
 * 解析 plan.md 提取任务和验收标准
 *
 * 支持两种格式：
 * - 表格格式（planner / file-formats.md 约定）：任务列表表格 + `### AC-N:` 段落
 * - 分段格式（旧版兼容）：任务以 `## 任务 N:` 开头
 *
 * 两种格式中 AC 条目均为 `操作 → 期望结果`
 */
export function parsePlan(planPath: string): Task[] {
  const content = fs.readFileSync(planPath, 'utf-8');
  const tasks = parseTaskSections(content);
  if (tasks.length > 0) return tasks;
  return parseTaskTable(content);
}

/**
 * 解析分段格式：任务以 `## 任务 N:` 开头
 */
function parseTaskSections(content: string): Task[] {
  const tasks: Task[] = [];

  // 按 "## 任务 N:" 分割
  const taskRegex = /^## 任务\s*(\d+)\s*[:：]\s*(.+)$/gm;
  const matches: { index: number; id: number; title: string }[] = [];

  let match;
  while ((match = taskRegex.exec(content)) !== null) {
    matches.push({
      index: match.index,
      id: parseInt(match[1], 10),
      title: match[2].trim(),
    });
  }

  if (matches.length === 0) {
    return tasks;
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const sectionStart = m.index;
    const sectionEnd = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const section = content.substring(sectionStart, sectionEnd);

    // 提取状态
    const status = extractStatus(section);

    // 提取涉及文件（从表格行）
    const files = extractFiles(section);

    // 提取描述（任务标题下方非表格、非 AC 的段落文本）
    const description = extractDescription(section);

    // 提取验收标准
    const acceptanceCriteria = extractAC(section, m.id);

    tasks.push({
      id: m.id,
      title: m.title,
      status,
      files,
      acceptanceCriteria,
      description,
      attempts: 0,
    });
  }

  return tasks;
}

function extractStatus(section: string): TaskStatus {
  // 查找表格行中的状态标记
  if (section.includes('✅')) return 'completed';
  if (section.includes('⚠️')) return 'needs_human';
  if (section.includes('🔄') || section.includes('进行中')) return 'in_progress';
  return 'pending';
}

/**
 * 解析表格格式：任务列表表格行（| N | 标题 | 状态 | 涉及文件 | 见 AC-N | ...）
 * AC 段落（### AC-N:）按表格中"见 AC-N"引用关联
 */
function parseTaskTable(content: string): Task[] {
  const acMap = parseAcSections(content);

  const tasks: Task[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (!line.startsWith('|')) continue;

    const cells = line.split('|').map(c => c.trim());
    // cells[0] 为行首 | 产生的空串；第一列必须是纯数字任务号（排除表头/分隔行）
    const idCell = cells[1];
    if (!/^\d+$/.test(idCell)) continue;

    const title = cells[2];
    if (!title) continue;

    const status = extractStatus(cells[3]);
    const files = extractFilesFromCell(cells[4]);

    const acNums = [...(cells[5] ?? '').matchAll(/AC-(\d+)/g)].map(m => parseInt(m[1], 10));
    const acceptanceCriteria = [...new Set(acNums)].flatMap(n => acMap.get(n) ?? []);

    tasks.push({
      id: parseInt(idCell, 10),
      title,
      status,
      files,
      acceptanceCriteria,
      attempts: 0,
    });
  }

  return tasks;
}

function parseAcSections(content: string): Map<number, AcceptanceCriterion[]> {
  const acMap = new Map<number, AcceptanceCriterion[]>();

  const acRegex = /^###\s*AC-(\d+)\s*[:：]?\s*(.*)$/gm;
  const matches: { index: number; id: number }[] = [];
  let m;
  while ((m = acRegex.exec(content)) !== null) {
    matches.push({ index: m.index, id: parseInt(m[1], 10) });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    acMap.set(matches[i].id, extractACItems(content.substring(start, end), matches[i].id));
  }

  return acMap;
}

function extractFilesFromCell(cell: string): string[] {
  if (!cell || cell === '-') return [];
  return [...new Set(
    cell.replace(/`/g, '')
      .split(',')
      .map(f => f.trim())
      .filter(f => f && f !== '-'),
  )];
}

function extractFiles(section: string): string[] {
  const files: string[] = [];
  const lines = section.split('\n');

  for (const line of lines) {
    // 表格行：| N | 任务 | 状态 | 涉及文件 | ...
    if (line.startsWith('|') && line.includes('`')) {
      // 提取反引号中的文件路径
      const backtickRegex = /`([^`]+)`/g;
      let m;
      while ((m = backtickRegex.exec(line)) !== null) {
        // 排除 agent ID 格式 (xxx-xxx)
        const val = m[1];
        if (val.includes('/') || val.includes('.')) {
          files.push(...val.split(',').map(f => f.trim()).filter(Boolean));
        }
      }
    }

    // 非表格行的涉及文件
    if (line.includes('涉及文件') && line.includes(':')) {
      const afterColon = line.split(':').slice(1).join(':').trim();
      if (afterColon && !afterColon.startsWith('-')) {
        files.push(...afterColon.split(',').map(f => f.trim()).filter(Boolean));
      }
    }
  }

  return [...new Set(files)];
}

function extractDescription(section: string): string {
  const lines = section.split('\n');
  const descLines: string[] = [];
  let pastTitle = false;

  for (const line of lines) {
    if (!pastTitle) {
      if (line.startsWith('## 任务')) {
        pastTitle = true;
      }
      continue;
    }

    // 遇到表格、AC 段落、空行后停止
    if (line.startsWith('|') || line.startsWith('### AC-') || line.startsWith('### 验收')) {
      break;
    }
    if (line.trim()) {
      descLines.push(line.trim());
    }
  }

  return descLines.join(' ');
}

function extractAC(section: string, taskId: number): AcceptanceCriterion[] {
  const criteria: AcceptanceCriterion[] = [];

  // 查找 AC 段落：### AC-N: {标题}
  const acRegex = /^###\s*AC-(\d+)\s*[:：]?\s*(.+)$/gm;
  const acMatches: { index: number; id: number }[] = [];

  let m;
  while ((m = acRegex.exec(section)) !== null) {
    acMatches.push({ index: m.index, id: parseInt(m[1], 10) });
  }

  if (acMatches.length === 0) {
    // 也尝试从任务段落下方直接解析 AC 条目
    return extractACItems(section, taskId);
  }

  for (let i = 0; i < acMatches.length; i++) {
    const acMatch = acMatches[i];
    const blockStart = acMatch.index;
    const blockEnd = i + 1 < acMatches.length ? acMatches[i + 1].index : section.length;
    const block = section.substring(blockStart, blockEnd);

    const items = extractACItems(block, acMatch.id);
    criteria.push(...items);
  }

  return criteria;
}

function extractACItems(text: string, acId: number): AcceptanceCriterion[] {
  const items: AcceptanceCriterion[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // 格式: "1. 操作 → 期望结果" 或 "- 操作 → 期望结果"
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 去掉编号前缀
    const cleaned = trimmed.replace(/^\d+\.\s*/, '').replace(/^-\s*/, '');

    if (cleaned.includes('→') || cleaned.includes('=>')) {
      const separator = cleaned.includes('→') ? '→' : '=>';
      const parts = cleaned.split(separator);
      if (parts.length >= 2) {
        items.push({
          id: `AC-${acId}`,
          operation: parts[0].trim(),
          expected: parts.slice(1).join(separator).trim(),
        });
      }
    }
  }

  return items;
}

/**
 * 更新 plan.md 中指定任务的状态标记
 */
export function updateTaskStatus(planPath: string, taskId: number, status: TaskStatus): void {
  const content = fs.readFileSync(planPath, 'utf-8');

  const statusMap: Record<TaskStatus, string> = {
    pending: '⏳ 待办',
    in_progress: '🔄 进行中',
    completed: '✅ 完成',
    needs_human: '⚠️ 人工处理',
  };

  const newStatus = statusMap[status];
  const replaceStatus = (line: string) => line
    .replace(/⏳\s*待办/g, newStatus)
    .replace(/✅\s*完成/g, newStatus)
    .replace(/⚠️\s*人工处理/g, newStatus)
    .replace(/🔄\s*进行中/g, newStatus);

  // 表格行：任务号列匹配即替换（表格格式 + 分段格式中的任务表格）
  const lines = content.split('\n');
  let updated = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;

    const cells = line.split('|').map(c => c.trim());
    const rowMatchesTask = cells[1] === String(taskId) || line.includes(`任务 ${taskId}`);
    if (rowMatchesTask) {
      const replaced = replaceStatus(line);
      if (replaced !== line) {
        lines[i] = replaced;
        updated = true;
      }
    }
  }
  if (updated) {
    fs.writeFileSync(planPath, lines.join('\n'), 'utf-8');
    return;
  }

  // 分段格式兜底：`## 任务 N:` 段落内首次出现的状态标记
  const oldStatuses = ['⏳ 待办', '✅ 完成', '⚠️ 人工处理', '🔄 进行中'];
  const taskRegex = new RegExp(
    `(##\\s*任务\\s*${taskId}\\s*[:：][^#]*?)(${oldStatuses.join('|')})`
  );
  fs.writeFileSync(planPath, content.replace(taskRegex, `$1${newStatus}`), 'utf-8');
}
