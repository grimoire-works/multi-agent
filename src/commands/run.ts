import path from 'path';
import { StateManager } from '../core/state-manager.js';
import { Orchestrator } from '../core/orchestrator.js';
import { log } from '../core/console.js';

export async function runCommand(projectDir?: string): Promise<void> {
  const cwd = projectDir ? path.resolve(projectDir) : process.cwd();
  const state = new StateManager(cwd);

  // 检查配置
  if (!state.hasConfig()) {
    log.error('未找到配置文件。请先运行 multi-agent-kit init');
    process.exit(1);
  }

  // 检查 plan.md
  if (!requireFile(state.planPath(), 'doc/plan.md')) return;

  // 加载配置
  const config = state.loadConfig();

  console.log('');
  log.info(`项目：${config.name}`);
  log.info(`智能体：${config.agents.join(', ')}`);

  // 初始化/加载状态
  const runState = state.loadState();
  const pending = runState.tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  log.info(`待执行任务：${pending.length} 个`);
  console.log('');

  if (pending.length === 0) {
    log.info('所有任务已完成');
    return;
  }

  // 启动编排
  const orchestrator = new Orchestrator(config, state);
  await orchestrator.run();
}

export function statusCommand(projectDir?: string): void {
  const cwd = projectDir ? path.resolve(projectDir) : process.cwd();
  const state = new StateManager(cwd);

  if (!state.hasConfig()) {
    log.error('未找到配置文件。请先运行 multi-agent-kit init');
    process.exit(1);
  }

  const config = state.loadConfig();
  const runState = state.loadState();
  const progress = state.getProgress();

  console.log('');
  console.log(`项目：${config.name}`);
  console.log(`语言：${config.language}${config.framework ? ' + ' + config.framework : ''}`);
  console.log(`智能体：${config.agents.join(', ')}`);
  console.log('');
  console.log(`任务进度：${progress.completed}/${progress.total} 完成`);
  console.log('');

  for (const task of runState.tasks) {
    const statusMap: Record<string, string> = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      needs_human: '⚠️',
    };
    const icon = statusMap[task.status] ?? '?';
    console.log(`  ${icon} 任务 ${task.id}: ${task.title} (${task.attempts} 次迭代)`);
  }

  console.log('');
}

function requireFile(filePath: string, displayPath: string): boolean {
  const fs = require('fs');
  if (!fs.existsSync(filePath)) {
    log.error(`未找到 ${displayPath}。请先创建。`);
    return false;
  }
  return true;
}
