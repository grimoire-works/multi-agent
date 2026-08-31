#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { runCommand, statusCommand } from './commands/run.js';

const program = new Command();

program
  .name('multi-agent-kit')
  .description('跨平台多智能体开发工作流 — 自动编排开发、测试、修正循环')
  .version('0.1.0')
  .usage('<command> [options]')
  .addHelpText('after', `
典型工作流:
  $ multi-agent-kit init              # 在当前项目初始化
  $ multi-agent-kit init ./my-project # 在指定项目初始化
  $ multi-agent-kit run               # 启动编排循环
  $ multi-agent-kit status            # 查看当前进度

文档:
  https://github.com/grimoire-works/multi-agent
`);

program
  .command('init')
  .description('初始化项目：探测项目信息、选择智能体、生成配置和任务模板')
  .argument('[project-dir]', '项目目录路径（默认当前目录）')
  .action(async (projectDir?: string) => {
    await initCommand(projectDir);
  });

program
  .command('run')
  .description('执行编排循环：逐任务开发 → 测试 → 修正')
  .argument('[project-dir]', '项目目录路径（默认当前目录）')
  .action(async (projectDir?: string) => {
    await runCommand(projectDir);
  });

program
  .command('status')
  .description('查看当前任务进度')
  .argument('[project-dir]', '项目目录路径（默认当前目录）')
  .action((projectDir?: string) => {
    statusCommand(projectDir);
  });

program.showHelpAfterError('(使用 --help 查看详细用法)');
program.showSuggestionAfterError(true);

program.parse(process.argv);
