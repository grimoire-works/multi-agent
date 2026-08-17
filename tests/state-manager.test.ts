import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateManager } from '../src/core/state-manager.js';
import type { ProjectConfig } from '../src/types/index.js';

let dir: string;
let state: StateManager;

const config: ProjectConfig = {
  name: 'Demo',
  codename: 'demo',
  language: 'TypeScript',
  sourceDir: 'src',
  buildCommand: 'npm run build',
  agents: ['dev', 'tester'],
  projectPath: '',
};

const PLAN = `# 开发计划 — Demo

## 任务列表
| # | 任务 | 状态 | 涉及文件 | 验收标准 | 备注 |
|---|------|------|----------|----------|------|
| 0 | 环境验证 | ⏳ 待办 | - | 构建零错误 | |
| 1 | 用户登录接口 | ⏳ 待办 | \`src/login.ts\` | 见 AC-1 | |

### AC-1: 用户登录接口
1. 输入正确账号密码 → 返回 token
`;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mak-state-'));
  config.projectPath = dir;
  state = new StateManager(dir);
  fs.mkdirSync(path.join(dir, 'doc'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'doc', 'plan.md'), PLAN, 'utf-8');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('配置管理', () => {
  it('saveConfig / loadConfig 往返一致', () => {
    state.saveConfig(config);
    expect(state.loadConfig()).toEqual(config);
  });

  it('loadConfig 遇损坏 JSON 时退出而非崩溃', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    fs.mkdirSync(path.join(dir, '.multi-agent'), { recursive: true });
    fs.writeFileSync(state.configPath(), '{ broken json', 'utf-8');

    state.loadConfig();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('状态管理', () => {
  it('initState 从 plan.md 解析任务并落盘', () => {
    const runState = state.initState();
    expect(runState.tasks.map(t => t.id)).toEqual([0, 1]);
    expect(fs.existsSync(state.statePath())).toBe(true);
  });

  it('loadState 从 state.json 恢复，保留运行时状态（plan.md 被编辑后）', () => {
    state.initState();
    state.updateTaskStatus(1, 'completed', 2);

    // 用户在编排执行中修改 plan.md 的任务标题
    const edited = PLAN.replace('用户登录接口', '用户登录接口（v2）');
    fs.writeFileSync(path.join(dir, 'doc', 'plan.md'), edited, 'utf-8');

    // 新 StateManager 实例模拟进程重启
    const reloaded = new StateManager(dir).loadState();
    const task1 = reloaded.tasks.find(t => t.id === 1)!;
    expect(task1.title).toBe('用户登录接口（v2）');
    expect(task1.status).toBe('completed');
    expect(task1.attempts).toBe(2);
  });

  it('state.json 损坏时从 plan.md 重建而非崩溃', () => {
    state.initState();
    state.updateTaskStatus(1, 'completed', 1);

    fs.writeFileSync(state.statePath(), 'not json', 'utf-8');

    // plan.md 在状态更新时已同步为 ✅，因此重建后任务状态从 plan.md 正确恢复
    const rebuilt = new StateManager(dir).loadState();
    expect(rebuilt.tasks.map(t => t.id)).toEqual([0, 1]);
    expect(rebuilt.tasks.find(t => t.id === 1)!.status).toBe('completed');
  });

  it('getNextTask 优先恢复 in_progress 任务', () => {
    state.initState();
    state.updateTaskStatus(0, 'completed', 1);
    state.updateTaskStatus(1, 'in_progress', 1);

    const next = state.getNextTask();
    expect(next?.id).toBe(1);
  });

  it('addTokenUsage 累计并持久化', () => {
    state.initState();
    state.addTokenUsage(100, 50);
    state.addTokenUsage(30, 20);

    const reloaded = new StateManager(dir).loadState();
    expect(reloaded.totalInputTokens).toBe(130);
    expect(reloaded.totalOutputTokens).toBe(70);
  });
});
