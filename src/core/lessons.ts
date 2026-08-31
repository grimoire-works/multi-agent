import fs from 'fs';
import path from 'path';
import type { Task } from '../types/index.js';

/**
 * 分级经验注入（对齐 skill 路径的注入策略）
 *
 * 优先级：项目专属规则（不计入条数） > 置信度 ≥ 0.7 的经验 > 任务关键词匹配的经验
 * 经验合计最多 5 条；注入后由代码强制写日志到 doc/main-log.md（/learn 命中统计的数据源）
 */

export interface LessonsInjection {
  /** 拼接好的注入文本（空串 = 无可注入内容） */
  text: string;
  /** 注入的 EXP 编号，用于注入日志 */
  expIds: string[];
}

interface ExpEntry {
  id: string;
  /** 压缩形式：标题 + 原因 + 解法 */
  compact: string;
  /** 用于关键词匹配的全文 */
  searchText: string;
  confidence: number;
}

const HIGH_CONFIDENCE = 0.7;
const MAX_LESSONS = 5;

export function buildLessonsInjection(projectPath: string, task: Task): LessonsInjection {
  const sections: string[] = [];
  const expIds: string[] = [];

  // 1. 项目专属规则（排除 principles.md，agent 定义里已要求遵守）
  const rules = readProjectRules(projectPath);
  if (rules) sections.push(`必须遵守的项目规则：\n${rules}`);

  // 2. 结构化经验：高置信度优先，其余按任务关键词匹配
  const entries = parseExpEntries(path.join(projectPath, 'doc', 'lessons-learned.md'));
  if (entries.length > 0) {
    const keywords = taskKeywords(task);
    const high = entries.filter(e => e.confidence >= HIGH_CONFIDENCE);
    const matched = entries.filter(
      e => e.confidence < HIGH_CONFIDENCE && keywords.some(k => e.searchText.includes(k)),
    );
    const selected = [...high, ...matched].slice(0, MAX_LESSONS);

    if (selected.length > 0) {
      sections.push(`历史经验提示（请优先关注）：\n${selected.map(e => e.compact).join('\n\n')}`);
      expIds.push(...selected.map(e => e.id));
    }
  }

  return { text: sections.join('\n\n'), expIds };
}

/** 注入日志写入 doc/main-log.md（由代码强制记录，不依赖 agent 自觉） */
export function logInjection(projectPath: string, expIds: string[], context: string): void {
  if (expIds.length === 0) return;
  const logPath = path.join(projectPath, 'doc', 'main-log.md');
  const line = `- ${timestamp()} 注入经验：${expIds.join(', ')}（${context}）\n`;
  fs.appendFileSync(logPath, line, 'utf-8');
}

function readProjectRules(projectPath: string): string {
  const rulesDir = path.join(projectPath, '.claude', 'rules');
  if (!fs.existsSync(rulesDir)) return '';

  const parts: string[] = [];
  for (const f of fs.readdirSync(rulesDir)) {
    if (!f.endsWith('.md') || f === 'principles.md') continue;
    try {
      const content = fs.readFileSync(path.join(rulesDir, f), 'utf-8').trim();
      if (content) parts.push(`# ${f}\n${content}`);
    } catch {
      // 读取失败跳过
    }
  }
  return parts.join('\n\n');
}

function parseExpEntries(lessonsPath: string): ExpEntry[] {
  if (!fs.existsSync(lessonsPath)) return [];
  const content = fs.readFileSync(lessonsPath, 'utf-8');

  const sections = content.split(/^###\s+(?=EXP-\d+)/m).filter(s => s.startsWith('EXP-'));
  return sections.map(section => {
    const lines = section.split('\n');
    const header = lines[0].trim();
    const id = header.split(':')[0].trim();

    // 表格行：| 置信度 | 0.7 |
    const confRow = lines.find(l => l.includes('置信度'));
    let confidence = 0;
    if (confRow) {
      const cell = confRow.split('|').map(c => c.trim()).find(c => /^\d+(\.\d+)?$/.test(c));
      if (cell) confidence = parseFloat(cell);
    }

    const pick = (prefix: string) => lines.find(l => l.startsWith(prefix))?.trim();
    const compact = [header, pick('**原因**'), pick('**解法**')].filter(Boolean).join('\n');

    return { id, compact, searchText: section, confidence };
  });
}

function taskKeywords(task: Task): string[] {
  const fromTitle = task.title.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2);
  const fromFiles = task.files.map(f => path.basename(f));
  return [...new Set([...fromTitle, ...fromFiles])];
}

function timestamp(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${yy}${mm}${dd} ${hh}${mi}`;
}
