import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildLessonsInjection, logInjection } from '../src/core/lessons.js';
import type { Task } from '../src/types/index.js';

let dir: string;

const task: Task = {
  id: 1,
  title: '用户登录接口',
  status: 'pending',
  files: ['src/login.ts'],
  acceptanceCriteria: [],
  attempts: 0,
};

function writeProject(setup: (dir: string) => void): string {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mak-lessons-inj-'));
  setup(dir);
  return dir;
}

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const LESSONS_V2 = `# 经验教训库

### EXP-001: 避免 ESM 中使用 require

| 字段 | 值 |
|------|-----|
| 触发条件 | Vite 项目打包前 |
| 置信度 | 0.8 |
| 命中次数 | 3 |

**原因**：ESM 打包器不转换 require

**解法**：改用 import 语法

### EXP-002: 用户登录接口要处理 token 过期

| 字段 | 值 |
|------|-----|
| 置信度 | 0.3 |

**原因**：token 过期未处理导致 401

**解法**：统一拦截器刷新 token

### EXP-003: 数据库连接池要设上限

| 字段 | 值 |
|------|-----|
| 置信度 | 0.3 |

**原因**：无上限导致连接耗尽

**解法**：配置 pool maxSize
`;

describe('buildLessonsInjection — 分级注入', () => {
  it('项目规则 + 高置信度经验注入，关键词匹配低置信度经验', () => {
    writeProject(d => {
      fs.mkdirSync(path.join(d, 'doc'), { recursive: true });
      fs.writeFileSync(path.join(d, 'doc', 'lessons-learned.md'), LESSONS_V2, 'utf-8');
      fs.mkdirSync(path.join(d, '.claude', 'rules'), { recursive: true });
      fs.writeFileSync(path.join(d, '.claude', 'rules', 'db-rules.md'), '数据库操作必须走 Repository 层', 'utf-8');
      fs.writeFileSync(path.join(d, '.claude', 'rules', 'principles.md'), '（meta-rule，不应注入）', 'utf-8');
    });

    const injection = buildLessonsInjection(dir, task);

    // 项目规则注入，且 principles.md 被排除
    expect(injection.text).toContain('必须遵守的项目规则');
    expect(injection.text).toContain('db-rules.md');
    expect(injection.text).not.toContain('meta-rule');

    // EXP-001 置信度 0.8 ≥ 0.7 → 注入
    // EXP-002 标题含任务关键词「用户登录接口」→ 注入
    // EXP-003 低置信度且无关键词匹配 → 不注入
    expect(injection.expIds).toEqual(['EXP-001', 'EXP-002']);
    expect(injection.text).not.toContain('连接池');
  });

  it('无规则无经验时返回空文本', () => {
    writeProject(d => {
      fs.mkdirSync(path.join(d, 'doc'), { recursive: true });
    });
    const injection = buildLessonsInjection(dir, task);
    expect(injection.text).toBe('');
    expect(injection.expIds).toEqual([]);
  });

  it('经验注入上限 5 条（高置信度优先）', () => {
    writeProject(d => {
      fs.mkdirSync(path.join(d, 'doc'), { recursive: true });
      const sections = Array.from({ length: 7 }, (_, i) =>
        `### EXP-00${i + 1}: 高置信经验 ${i + 1}\n\n| 字段 | 值 |\n|------|-----|\n| 置信度 | 0.9 |\n\n**原因**：原因 ${i + 1}\n\n**解法**：解法 ${i + 1}\n`);
      fs.writeFileSync(path.join(d, 'doc', 'lessons-learned.md'), sections.join(''), 'utf-8');
    });

    const injection = buildLessonsInjection(dir, task);
    expect(injection.expIds).toHaveLength(5);
    expect(injection.expIds[0]).toBe('EXP-001');
  });
});

describe('logInjection — 注入日志', () => {
  it('追加写入 main-log.md，格式可被 /learn 统计', () => {
    writeProject(d => {
      fs.mkdirSync(path.join(d, 'doc'), { recursive: true });
      fs.writeFileSync(path.join(d, 'doc', 'main-log.md'), '- 260101 1000 项目启动\n', 'utf-8');
    });

    logInjection(dir, ['EXP-001', 'EXP-002'], '任务 1');
    logInjection(dir, [], '任务 2'); // 空 ID 不写

    const content = fs.readFileSync(path.join(dir, 'doc', 'main-log.md'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^- \d{6} \d{4} 注入经验：EXP-001, EXP-002（任务 1）$/);
  });
});
