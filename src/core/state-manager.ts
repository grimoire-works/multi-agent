import fs from 'fs';
import path from 'path';
import type { RunState, Task, TaskStatus, ProjectConfig } from '../types/index.js';
import { parsePlan, updateTaskStatus } from './plan-parser.js';

const STATE_DIR = '.multi-agent';
const CONFIG_FILE = 'config.json';
const STATE_FILE = 'state.json';
const PLAN_FILE = path.join('doc', 'plan.md');

export class StateManager {
  private projectDir: string;
  private state: RunState | null = null;

  constructor(projectDir: string) {
    this.projectDir = path.resolve(projectDir);
  }

  // ── 配置管理 ──

  configPath(): string {
    return path.join(this.projectDir, STATE_DIR, CONFIG_FILE);
  }

  statePath(): string {
    return path.join(this.projectDir, STATE_DIR, STATE_FILE);
  }

  planPath(): string {
    return path.join(this.projectDir, PLAN_FILE);
  }

  loadConfig(): ProjectConfig {
    const raw = fs.readFileSync(this.configPath(), 'utf-8');
    return JSON.parse(raw);
  }

  saveConfig(config: ProjectConfig): void {
    const dir = path.dirname(this.configPath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.configPath(), JSON.stringify(config, null, 2), 'utf-8');
  }

  hasConfig(): boolean {
    return fs.existsSync(this.configPath());
  }

  // ── 状态管理 ──

  /**
   * 初始化运行状态（从 plan.md 解析任务）
   */
  initState(): RunState {
    const planPath = this.planPath();
    const tasks = parsePlan(planPath);

    this.state = {
      currentTaskId: 0,
      tasks,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    this.saveState();
    return this.state;
  }

  /**
   * 加载已有状态（从中断恢复）
   */
  loadState(): RunState {
    if (this.state) return this.state;

    // 尝试从 state.json 恢复
    if (fs.existsSync(this.statePath())) {
      const raw = fs.readFileSync(this.statePath(), 'utf-8');
      this.state = JSON.parse(raw);

      // 刷新任务列表（plan.md 可能被用户修改）
      const freshTasks = parsePlan(this.planPath());
      this.mergeTasks(freshTasks);
      return this.state!;
    }

    // 无状态文件，从 plan.md 初始化
    return this.initState();
  }

  saveState(): void {
    if (!this.state) return;
    this.state.updatedAt = new Date().toISOString();

    const dir = path.dirname(this.statePath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.statePath(), JSON.stringify(this.state, null, 2), 'utf-8');
  }

  // ── 任务操作 ──

  /**
   * 获取下一个待执行任务
   */
  getNextTask(): Task | null {
    const state = this.loadState();

    // 优先处理 in_progress 的任务（中断恢复）
    const inProgress = state.tasks.find(t => t.status === 'in_progress');
    if (inProgress) return inProgress;

    // 然后取第一个 pending 任务
    const pending = state.tasks.find(t => t.status === 'pending');
    return pending ?? null;
  }

  updateTaskStatus(taskId: number, status: TaskStatus, attempts?: number): void {
    const state = this.loadState();
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.status = status;
    if (attempts !== undefined) {
      task.attempts = attempts;
    }

    // 同步更新 plan.md
    updateTaskStatus(this.planPath(), taskId, status);
    this.saveState();
  }

  addTokenUsage(input: number, output: number): void {
    const state = this.loadState();
    state.totalInputTokens += input;
    state.totalOutputTokens += output;
    this.saveState();
  }

  getProgress(): { total: number; completed: number; pending: number; failed: number } {
    const state = this.loadState();
    return {
      total: state.tasks.length,
      completed: state.tasks.filter(t => t.status === 'completed').length,
      pending: state.tasks.filter(t => t.status === 'pending').length,
      failed: state.tasks.filter(t => t.status === 'needs_human').length,
    };
  }

  getTask(taskId: number): Task | undefined {
    const state = this.loadState();
    return state.tasks.find(t => t.id === taskId);
  }

  // ── 内部方法 ──

  /**
   * 合并 plan.md 的新任务列表到已有状态
   * - 保留已有任务的 attempts 和 status（除非 plan.md 中状态不同）
   * - 新增 plan.md 中新出现的任务
   */
  private mergeTasks(freshTasks: Task[]): void {
    if (!this.state) return;

    const existingMap = new Map(this.state.tasks.map(t => [t.id, t]));

    const merged = freshTasks.map(fresh => {
      const existing = existingMap.get(fresh.id);
      if (existing) {
        // 保留运行时状态，但更新标题和 AC（用户可能改了 plan.md）
        return {
          ...fresh,
          status: existing.status,
          attempts: existing.attempts,
        };
      }
      return fresh;
    });

    this.state.tasks = merged;
    this.saveState();
  }
}
