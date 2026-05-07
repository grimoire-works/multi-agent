import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { ProjectConfig, Task, TestResult, TestVerdict } from '../types/index.js';
import { StateManager } from './state-manager.js';
import { AgentRunner } from './agent-runner.js';
import { loadAgentPrompt, buildDevPrompt, buildTesterPrompt, buildCorrectionPrompt, buildRetestPrompt, readLessonsLearned } from './prompt-loader.js';
import { log, showProgress, showSpinner, showSummaryReport, formatTestVerdict } from './console.js';

const MAX_CORRECTION_ROUNDS = 3;

export class Orchestrator {
  private config: ProjectConfig;
  private state: StateManager;

  constructor(config: ProjectConfig, state: StateManager) {
    this.config = config;
    this.state = state;
  }

  async run(): Promise<void> {
    const runState = this.state.loadState();
    const totalTasks = runState.tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;

    if (totalTasks === 0) {
      log.info('没有待执行的任务');
      return;
    }

    log.info(`开始执行，共 ${totalTasks} 个待办任务`);
    console.log('');

    let task: Task | null;
    while ((task = this.state.getNextTask()) !== null) {
      await this.executeTask(task);
    }

    this.showFinalReport();
  }

  private async executeTask(task: Task): Promise<void> {
    this.state.updateTaskStatus(task.id, 'in_progress');
    console.log('');
    log.step(`任务 ${task.id}: ${task.title}`);
    showProgress(0, 1, task.title);

    // 1. 注入经验教训
    const lessons = readLessonsLearned(this.config.projectPath);

    // 2. 开发
    const devPrompt = loadAgentPrompt('dev', this.config);
    const devRunner = new AgentRunner({
      cwd: this.config.projectPath,
      systemPrompt: devPrompt,
    });

    const devSpinner = showSpinner(`开发中：任务 ${task.id}...`);
    const devResult = await devRunner.run(buildDevPrompt(task, lessons));
    devSpinner.stop();

    this.state.addTokenUsage(devResult.inputTokens, devResult.outputTokens);

    if (!devResult.success) {
      log.error(`开发失败：${devResult.error}`);
      this.state.updateTaskStatus(task.id, 'needs_human', 1);
      return;
    }

    log.success(`开发完成（tokens: ${(devResult.inputTokens + devResult.outputTokens) / 1000}k）`);

    // 3. 快速验证（构建命令）
    if (this.config.buildCommand) {
      const buildOk = this.runBuildCheck();
      if (!buildOk) {
        log.warn('构建失败，尝试修复...');
        // 简单修复：再跑一轮 dev agent
        const fixResult = await devRunner.run(
          `构建命令 ${this.config.buildCommand} 报错了，请修复构建错误。修复后运行构建命令确认。`
        );
        this.state.addTokenUsage(fixResult.inputTokens, fixResult.outputTokens);
        if (!fixResult.success) {
          log.error('自动修复失败');
          this.state.updateTaskStatus(task.id, 'needs_human', 1);
          return;
        }
      }
    }

    // 4. 测试（如果有 tester agent）
    if (this.config.agents.includes('tester')) {
      await this.runTestLoop(task);
    } else {
      // 无 tester，直接标记完成
      this.state.updateTaskStatus(task.id, 'completed', 1);
      log.success(`任务 ${task.id} 完成（无测试）`);
    }
  }

  private async runTestLoop(task: Task): Promise<void> {
    const testerPrompt = loadAgentPrompt('tester', this.config);
    let attempts = 1;

    // 首次测试
    const testRunner = new AgentRunner({
      cwd: this.config.projectPath,
      systemPrompt: testerPrompt,
    });

    const testSpinner = showSpinner(`测试中：任务 ${task.id}...`);
    const testResult = await testRunner.run(buildTesterPrompt(task));
    testSpinner.stop();

    this.state.addTokenUsage(testResult.inputTokens, testResult.outputTokens);

    const reportPath = path.join(this.config.projectPath, 'doc', 'test-reports', `task${task.id}-report.md`);
    const verdict = this.parseTestVerdict(testResult.output, reportPath);

    log.info(`首次测试：${formatTestVerdict(verdict)}`);

    if (verdict === 'PASS') {
      this.state.updateTaskStatus(task.id, 'completed', attempts);
      log.success(`任务 ${task.id} 完成（${attempts} 次迭代）`);
      showProgress(1, 1, task.title);
      return;
    }

    // 修正循环
    for (let round = 1; round <= MAX_CORRECTION_ROUNDS; round++) {
      attempts++;

      const lessons = readLessonsLearned(this.config.projectPath);

      // 修正
      log.step(`第 ${round} 轮修正...`);
      const devPrompt = loadAgentPrompt('dev', this.config);
      const fixRunner = new AgentRunner({
        cwd: this.config.projectPath,
        systemPrompt: devPrompt,
      });

      const fixSpinner = showSpinner(`修正中：第 ${round} 轮...`);
      const fixResult = await fixRunner.run(
        buildCorrectionPrompt(task, reportPath, lessons, round)
      );
      fixSpinner.stop();

      this.state.addTokenUsage(fixResult.inputTokens, fixResult.outputTokens);

      if (!fixResult.success) {
        log.error(`修正失败：${fixResult.error}`);
        continue;
      }

      // 重测
      const retestRunner = new AgentRunner({
        cwd: this.config.projectPath,
        systemPrompt: testerPrompt,
      });

      const retestSpinner = showSpinner(`重测中：第 ${round} 轮...`);
      const retestResult = await retestRunner.run(buildRetestPrompt(task));
      retestSpinner.stop();

      this.state.addTokenUsage(retestResult.inputTokens, retestResult.outputTokens);

      const retestVerdict = this.parseTestVerdict(retestResult.output, reportPath);
      log.info(`第 ${round} 轮重测：${formatTestVerdict(retestVerdict)}`);

      if (retestVerdict === 'PASS') {
        this.state.updateTaskStatus(task.id, 'completed', attempts);
        log.success(`任务 ${task.id} 完成（${attempts} 次迭代）`);
        showProgress(1, 1, task.title);
        return;
      }
    }

    // 3 轮修正后仍 FAIL
    this.state.updateTaskStatus(task.id, 'needs_human', attempts);
    log.warn(`任务 ${task.id}：${MAX_CORRECTION_ROUNDS} 轮修正后仍未通过，标记为人工处理`);
  }

  // ── 辅助方法 ──

  private runBuildCheck(): boolean {
    if (!this.config.buildCommand) return true;
    try {
      execSync(this.config.buildCommand, {
        cwd: this.config.projectPath,
        timeout: 120000,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  private parseTestVerdict(output: string, reportPath: string): TestVerdict {
    // 先检查测试报告文件
    if (fs.existsSync(reportPath)) {
      const report = fs.readFileSync(reportPath, 'utf-8');
      if (report.includes('### 判定：PASS') || report.includes('判定：PASS')) {
        return 'PASS';
      }
      if (report.includes('### 判定：FAIL') || report.includes('判定：FAIL')) {
        return 'FAIL';
      }
    }

    // 从 agent 输出中判断
    const upper = output.toUpperCase();
    if (upper.includes('PASS') && !upper.includes('FAIL')) {
      return 'PASS';
    }
    if (upper.includes('FAIL')) {
      return 'FAIL';
    }

    // 无法判断时默认 PASS（无 tester 的场景）
    return 'PASS';
  }

  private showFinalReport(): void {
    const state = this.state.loadState();
    const progress = this.state.getProgress();

    showSummaryReport({
      totalTasks: progress.total,
      completed: progress.completed,
      needsHuman: progress.failed,
      totalAttempts: state.tasks.reduce((sum, t) => sum + t.attempts, 0),
      inputTokens: state.totalInputTokens,
      outputTokens: state.totalOutputTokens,
      taskDetails: state.tasks.map(t => ({
        id: t.id,
        title: t.title,
        attempts: t.attempts,
        status: t.status,
      })),
    });
  }
}
