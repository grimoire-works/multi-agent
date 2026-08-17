import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parsePlan, updateTaskStatus } from '../src/core/plan-parser.js';

let dir: string;
let planPath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mak-plan-'));
  planPath = path.join(dir, 'plan.md');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** planner / file-formats.md 约定的表格格式（harness 自己生成的格式） */
const TABLE_FORMAT = `# 开发计划 — Demo

## 项目概述
演示项目

## 任务列表
| # | 任务 | 状态 | 涉及文件 | 验收标准 | 备注 |
|---|------|------|----------|----------|------|
| 0 | 环境验证 + 编译检查 | ⏳ 待办 | - | 构建命令零错误 | 基础任务 |
| 1 | 用户登录接口 | ⏳ 待办 | \`src/login.ts\` | 见 AC-1 | 30-150 行 |
| 2 | 密码加密存储 | ✅ 完成 | \`src/crypto.ts\`, \`src/db.ts\` | 见 AC-2 | |

## 验收标准

### AC-1: 用户登录接口
1. 输入正确账号密码调用登录接口 → 返回 token
2. 密码错误 → 返回 401

### AC-2: 密码加密存储
1. 保存用户 → 数据库中密码为 bcrypt 哈希

## 当前进度
- 已完成：1/3
`;

/** 旧版分段格式（`## 任务 N:` 开头） */
const SECTION_FORMAT = `# 开发计划 — Demo

## 任务 1: 用户登录接口

| # | 任务 | 状态 | 涉及文件 |
|---|------|------|----------|
| 1 | 用户登录接口 | ⏳ 待办 | \`src/login.ts\` |

实现登录功能。

### AC-1: 用户登录接口
1. 输入正确账号密码 → 返回 token

## 任务 2: 密码加密存储

| 2 | 密码加密存储 | ⚠️ 人工处理 | \`src/crypto.ts\` |
`;

describe('parsePlan — 表格格式（planner 生成的标准格式）', () => {
  beforeEach(() => {
    fs.writeFileSync(planPath, TABLE_FORMAT, 'utf-8');
  });

  it('解析出任务列表表格中的全部任务', () => {
    const tasks = parsePlan(planPath);
    expect(tasks.map(t => t.id)).toEqual([0, 1, 2]);
  });

  it('解析任务标题与状态', () => {
    const tasks = parsePlan(planPath);
    expect(tasks[1].title).toBe('用户登录接口');
    expect(tasks[0].status).toBe('pending');
    expect(tasks[1].status).toBe('pending');
    expect(tasks[2].status).toBe('completed');
  });

  it('提取涉及文件列（反引号包裹、逗号分隔），占位符 - 视为无文件', () => {
    const tasks = parsePlan(planPath);
    expect(tasks[0].files).toEqual([]);
    expect(tasks[1].files).toEqual(['src/login.ts']);
    expect(tasks[2].files).toEqual(['src/crypto.ts', 'src/db.ts']);
  });

  it('按「见 AC-N」关联 AC 段落条目', () => {
    const tasks = parsePlan(planPath);
    expect(tasks[0].acceptanceCriteria).toHaveLength(0);
    expect(tasks[1].acceptanceCriteria).toHaveLength(2);
    expect(tasks[1].acceptanceCriteria[0]).toEqual({
      id: 'AC-1',
      operation: '输入正确账号密码调用登录接口',
      expected: '返回 token',
    });
    expect(tasks[2].acceptanceCriteria).toHaveLength(1);
  });

  it('新任务 attempts 初始为 0', () => {
    const tasks = parsePlan(planPath);
    expect(tasks.every(t => t.attempts === 0)).toBe(true);
  });
});

describe('parsePlan — 分段格式（旧版兼容）', () => {
  beforeEach(() => {
    fs.writeFileSync(planPath, SECTION_FORMAT, 'utf-8');
  });

  it('按 ## 任务 N: 分段解析', () => {
    const tasks = parsePlan(planPath);
    expect(tasks.map(t => t.id)).toEqual([1, 2]);
    expect(tasks[0].title).toBe('用户登录接口');
    expect(tasks[0].acceptanceCriteria).toHaveLength(1);
  });

  it('解析分段内的状态标记', () => {
    const tasks = parsePlan(planPath);
    expect(tasks[1].status).toBe('needs_human');
  });
});

describe('updateTaskStatus', () => {
  beforeEach(() => {
    fs.writeFileSync(planPath, TABLE_FORMAT, 'utf-8');
  });

  it('表格格式：更新指定任务的状态，不影响其他任务', () => {
    updateTaskStatus(planPath, 1, 'completed');
    const tasks = parsePlan(planPath);
    expect(tasks[1].status).toBe('completed');
    expect(tasks[0].status).toBe('pending');
    expect(tasks[2].status).toBe('completed');
  });

  it('表格格式：completed → needs_human 往返', () => {
    updateTaskStatus(planPath, 2, 'needs_human');
    const tasks = parsePlan(planPath);
    expect(tasks[2].status).toBe('needs_human');
  });

  it('分段格式：更新段落内表格行的状态', () => {
    fs.writeFileSync(planPath, SECTION_FORMAT, 'utf-8');
    updateTaskStatus(planPath, 2, 'pending');
    const tasks = parsePlan(planPath);
    expect(tasks[1].status).toBe('pending');
  });
});
