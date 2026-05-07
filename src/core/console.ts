import chalk from 'chalk';
import ora from 'ora';

export const log = {
  info: (msg: string) => console.log(chalk.blue('ℹ'), msg),
  success: (msg: string) => console.log(chalk.green('✔'), msg),
  warn: (msg: string) => console.log(chalk.yellow('⚠'), msg),
  error: (msg: string) => console.log(chalk.red('✖'), msg),
  step: (msg: string) => console.log(chalk.cyan('→'), msg),
};

export function formatTaskStatus(status: string): string {
  switch (status) {
    case 'completed': return chalk.green('✅ 完成');
    case 'in_progress': return chalk.blue('🔄 进行中');
    case 'needs_human': return chalk.yellow('⚠️  人工处理');
    case 'pending': return chalk.gray('⏳ 待办');
    default: return status;
  }
}

export function formatTestVerdict(verdict: string): string {
  switch (verdict) {
    case 'PASS': return chalk.green.bold('PASS');
    case 'FAIL': return chalk.red.bold('FAIL');
    case 'SKIP': return chalk.yellow.bold('SKIP');
    default: return verdict;
  }
}

export function showProgress(current: number, total: number, title: string): void {
  const bar = '█'.repeat(current) + '░'.repeat(total - current);
  console.log(chalk.gray(`  [${bar}] ${current}/${total} — ${title}`));
}

export function showSpinner(text: string): ReturnType<typeof ora> {
  return ora(text);
}

export function showSummaryReport(report: {
  totalTasks: number;
  completed: number;
  needsHuman: number;
  totalAttempts: number;
  inputTokens: number;
  outputTokens: number;
  taskDetails: { id: number; title: string; attempts: number; status: string }[];
}): void {
  console.log('');
  console.log(chalk.bold('═══════════════════════════════════'));
  console.log(chalk.bold('  执行报告'));
  console.log(chalk.bold('═══════════════════════════════════'));
  console.log('');

  // 总览
  console.log(`  任务总数：${report.totalTasks}`);
  console.log(`  ${chalk.green('通过：')}${report.completed}`);
  console.log(`  ${chalk.yellow('需人工：')}${report.needsHuman}`);
  console.log(`  总迭代次数：${report.totalAttempts}`);
  console.log('');

  // Token 统计
  const totalTokens = report.inputTokens + report.outputTokens;
  console.log(`  Token 用量：${(totalTokens / 1000).toFixed(1)}k`);
  console.log(`    输入：${(report.inputTokens / 1000).toFixed(1)}k`);
  console.log(`    输出：${(report.outputTokens / 1000).toFixed(1)}k`);
  console.log('');

  // 逐任务详情
  console.log(chalk.bold('  任务详情：'));
  for (const t of report.taskDetails) {
    const status = formatTaskStatus(t.status);
    console.log(`    任务 ${t.id}: ${t.title} — ${status} (${t.attempts} 次迭代)`);
  }

  console.log('');
  console.log(chalk.bold('═══════════════════════════════════'));
  console.log('');
}
