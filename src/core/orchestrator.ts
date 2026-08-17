import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { ProjectConfig, Task, TestResult, TestVerdict } from '../types/index.js';
import { StateManager } from './state-manager.js';
import { AgentRunner } from './agent-runner.js';
import { loadAgentPrompt, buildDevPrompt, buildTesterPrompt, buildCorrectionPrompt, buildRetestPrompt, readLessonsLearned } from './prompt-loader.js';
import { log, showProgress, showSpinner, showSummaryReport, formatTestVerdict } from './console.js';

const DEFAULT_MAX_CORRECTION_ROUNDS = 3;
const DEFAULT_BUILD_TIMEOUT_MS = 120_000;

export class Orchestrator {
  private config: ProjectConfig;
  private state: StateManager;

  constructor(config: ProjectConfig, state: StateManager) {
    this.config = config;
    this.state = state;
  }

  private get maxCorrectionRounds(): number {
    return this.config.orchestration?.maxCorrectionRounds ?? DEFAULT_MAX_CORRECTION_ROUNDS;
  }

  private createRunner(systemPrompt: string): AgentRunner {
    const orch = this.config.orchestration;
    return new AgentRunner({
      cwd: this.config.projectPath,
      systemPrompt,
      model: orch?.agentModel,
      maxTurns: orch?.agentMaxTurns,
      timeoutMs: orch?.agentTimeoutMs,
    });
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
    const devRunner = this.createRunner(devPrompt);

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
    // 报告命名遵循模板契约：task-{N}-r{round}.md，每 round 独立文件不覆盖
    let round = 0;
    let reportRelPath = this.reportRelPath(task.id, round);

    // 首次测试
    const testRunner = this.createRunner(testerPrompt);

    const testSpinner = showSpinner(`测试中：任务 ${task.id}...`);
    const testResult = await testRunner.run(buildTesterPrompt(task, reportRelPath));
    testSpinner.stop();

    this.state.addTokenUsage(testResult.inputTokens, testResult.outputTokens);

    let verdict = this.parseTestVerdict(testResult.output, this.absReportPath(reportRelPath));

    log.info(`首次测试：${formatTestVerdict(verdict)}`);

    if (verdict === 'PASS') {
      this.state.updateTaskStatus(task.id, 'completed', attempts);
      log.success(`任务 ${task.id} 完成（${attempts} 次迭代）`);
      showProgress(1, 1, task.title);
      return;
    }

    if (verdict === 'SKIP') {
      this.state.updateTaskStatus(task.id, 'needs_human', attempts);
      log.warn(`任务 ${task.id}：测试结果无法判定（报告无判定行且返回无「测试结果：」），标记为人工处理`);
      return;
    }

    // 修正循环
    while (round < this.maxCorrectionRounds) {
      round++;
      attempts++;

      const lessons = readLessonsLearned(this.config.projectPath);

      // 修正（引用上轮报告）
      log.step(`第 ${round} 轮修正...`);
      const devPrompt = loadAgentPrompt('dev', this.config);
      const fixRunner = this.createRunner(devPrompt);

      const fixSpinner = showSpinner(`修正中：第 ${round} 轮...`);
      const fixResult = await fixRunner.run(
        buildCorrectionPrompt(task, reportRelPath, lessons, round)
      );
      fixSpinner.stop();

      this.state.addTokenUsage(fixResult.inputTokens, fixResult.outputTokens);

      if (!fixResult.success) {
        log.error(`修正失败：${fixResult.error}`);
        continue;
      }

      // 重测（新 round 新报告文件，不覆盖上轮）
      const prevReportRelPath = reportRelPath;
      reportRelPath = this.reportRelPath(task.id, round);
      const retestRunner = this.createRunner(testerPrompt);

      const retestSpinner = showSpinner(`重测中：第 ${round} 轮...`);
      const retestResult = await retestRunner.run(
        buildRetestPrompt(task, prevReportRelPath, reportRelPath)
      );
      retestSpinner.stop();

      this.state.addTokenUsage(retestResult.inputTokens, retestResult.outputTokens);

      verdict = this.parseTestVerdict(retestResult.output, this.absReportPath(reportRelPath));
      log.info(`第 ${round} 轮重测：${formatTestVerdict(verdict)}`);

      if (verdict === 'PASS') {
        this.state.updateTaskStatus(task.id, 'completed', attempts);
        log.success(`任务 ${task.id} 完成（${attempts} 次迭代）`);
        showProgress(1, 1, task.title);
        return;
      }

      if (verdict === 'SKIP') {
        this.state.updateTaskStatus(task.id, 'needs_human', attempts);
        log.warn(`任务 ${task.id}：第 ${round} 轮重测结果无法判定，标记为人工处理`);
        return;
      }
    }

    // 修正轮次耗尽仍 FAIL
    this.state.updateTaskStatus(task.id, 'needs_human', attempts);
    log.warn(`任务 ${task.id}：${this.maxCorrectionRounds} 轮修正后仍未通过，标记为人工处理`);
  }

  // ── 辅助方法 ──

  /** 测试报告相对路径，遵循模板契约 task-{N}-r{round}.md */
  private reportRelPath(taskId: number, round: number): string {
    return path.join('doc', 'test-reports', `task-${taskId}-r${round}.md`);
  }

  private absReportPath(reportRelPath: string): string {
    return path.join(this.config.projectPath, reportRelPath);
  }

  private runBuildCheck(): boolean {
    if (!this.config.buildCommand) return true;
    try {
      execSync(this.config.buildCommand, {
        cwd: this.config.projectPath,
        timeout: this.config.orchestration?.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  private parseTestVerdict(output: string, reportPath: string): TestVerdict {
    // 1. 测试报告文件中的最终判定行（### 判定：PASS / FAIL），取最后一次出现
    if (fs.existsSync(reportPath)) {
      const report = fs.readFileSync(reportPath, 'utf-8');
      const reportVerdict = this.extractFinalVerdict(report);
      if (reportVerdict) return reportVerdict;
    }

    // 2. agent 输出中的最终判定行（tester 可能回显报告内容）
    const outputVerdict = this.extractFinalVerdict(output);
    if (outputVerdict) return outputVerdict;

    // 3. tester 的返回契约格式：测试结果：PASS / FAIL
    const returnMatch = [...output.matchAll(/^测试结果[：:]\s*(PASS|FAIL)\s*$/gm)].at(-1)?.[1];
    if (returnMatch === 'PASS' || returnMatch === 'FAIL') return returnMatch;

    // 4. 无法判定：不放行，交由人工处理
    return 'SKIP';
  }

  private extractFinalVerdict(text: string): TestVerdict | null {
    const matches = [...text.matchAll(/^#{2,3}\s*判定[：:]\s*(PASS|FAIL)\s*$/gm)];
    const final = matches.at(-1)?.[1];
    if (final === 'PASS' || final === 'FAIL') return final;
    return null;
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
