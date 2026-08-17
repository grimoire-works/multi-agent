import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import type { ProjectConfig, AgentRole } from '../types/index.js';
import { log, showSpinner } from '../core/console.js';
import { AgentRunner } from '../core/agent-runner.js';
import { buildPlannerSystemPrompt, buildPlannerUserPrompt } from '../core/prompt-loader.js';

// ── 项目探测 ──

interface DetectionResult {
  name: string;
  language: string;
  framework?: string;
  sourceDir: string;
  buildCommand?: string;
  testCommand?: string;
  installCommand?: string;
  codename: string;
}

function detectProject(cwd: string): DetectionResult {
  const result: DetectionResult = {
    name: path.basename(cwd),
    language: '',
    sourceDir: '',
    codename: '',
  };

  // 项目名称
  for (const configFile of ['package.json', 'pubspec.yaml', 'pom.xml', 'setup.py', 'Cargo.toml', 'pyproject.toml']) {
    const p = path.join(cwd, configFile);
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        if (configFile === 'package.json') {
          const pkg = JSON.parse(content);
          result.name = pkg.name || result.name;
        } else if (configFile === 'pubspec.yaml') {
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          if (nameMatch) result.name = nameMatch[1].trim();
        } else if (configFile === 'Cargo.toml') {
          const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
          if (nameMatch) result.name = nameMatch[1];
        }
      } catch {
        // 解析失败，使用目录名
      }
      break;
    }
  }

  // 语言检测
  const extensions: Record<string, string> = {
    '.dart': 'Dart', '.ts': 'TypeScript', '.tsx': 'TypeScript',
    '.js': 'JavaScript', '.jsx': 'JavaScript', '.java': 'Java',
    '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.vue': 'Vue',
  };

  const foundLangs = new Set<string>();
  for (const dir of ['lib', 'src', 'app', 'pages', '.']) {
    const dirPath = path.join(cwd, dir);
    if (!fs.existsSync(dirPath)) continue;
    try {
      const files = fs.readdirSync(dirPath, { recursive: true }) as string[];
      for (const f of files) {
        const ext = path.extname(f);
        if (extensions[ext]) {
          foundLangs.add(extensions[ext]);
        }
      }
    } catch {
      // 权限问题，跳过
    }
    if (foundLangs.size > 0) break;
  }
  result.language = [...foundLangs][0] ?? 'Unknown';

  // 框架检测
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['flutter']) result.framework = 'Flutter';
      else if (deps['next']) result.framework = 'Next.js';
      else if (deps['nuxt']) result.framework = 'Nuxt';
      else if (deps['vue'] || deps['@vue/cli-service']) result.framework = 'Vue';
      else if (deps['react'] || deps['react-dom']) result.framework = 'React';
      else if (deps['angular'] || deps['@angular/core']) result.framework = 'Angular';
      else if (deps['svelte']) result.framework = 'Svelte';
    } catch {
      // 解析失败
    }
  }

  const pubspecPath = path.join(cwd, 'pubspec.yaml');
  if (fs.existsSync(pubspecPath)) {
    result.framework = 'Flutter';
    result.language = result.language || 'Dart';
  }

  // 源码目录
  for (const dir of ['lib', 'src', 'app', 'pages']) {
    if (fs.existsSync(path.join(cwd, dir))) {
      result.sourceDir = dir + '/';
      break;
    }
  }

  // 构建命令
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
      if (pkg.scripts?.build) result.buildCommand = 'npm run build';
      if (pkg.scripts?.test) result.testCommand = 'npm test';
      result.installCommand = 'npm install';
    } catch {
      // 解析失败
    }
  } else if (fs.existsSync(path.join(cwd, 'pubspec.yaml'))) {
    result.buildCommand = 'flutter analyze';
    result.testCommand = 'flutter test';
    result.installCommand = 'flutter pub get';
  } else if (fs.existsSync(path.join(cwd, 'pom.xml'))) {
    result.buildCommand = 'mvn compile';
    result.testCommand = 'mvn test';
  } else if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    result.buildCommand = 'cargo build';
    result.testCommand = 'cargo test';
  } else if (fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'setup.py'))) {
    result.buildCommand = undefined;
    result.testCommand = 'pytest';
    result.installCommand = 'pip install -r requirements.txt';
  }

  // 代号
  result.codename = result.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 12);

  return result;
}

// ── init 命令 ──

export async function initCommand(projectDir?: string): Promise<void> {
  const cwd = projectDir ? path.resolve(projectDir) : process.cwd();

  console.log('');
  log.info(`项目目录：${cwd}`);
  console.log('');

  // 检查源码文件
  const hasSource = checkSourceFiles(cwd);
  if (!hasSource) {
    log.error('未检测到源代码文件。本工具适用于已有代码的项目。');
    log.info('请先创建项目骨架（如 npm init / flutter create）后再运行。');
    process.exit(1);
  }

  // 探测项目信息
  const detected = detectProject(cwd);

  // 交互确认
  const confirmResult = await inquirer.prompt<{
    confirmed: boolean;
    name?: string;
    framework?: string;
    buildCommand?: string;
    sourceDir?: string;
  }>([
    {
      type: 'confirm',
      name: 'confirmed',
      message: `探测结果：
  项目名称：${detected.name}
  语言：${detected.language}
  框架：${detected.framework ?? '⚠️ 未检测到'}
  源码目录：${detected.sourceDir || '⚠️ 未检测到'}
  构建命令：${detected.buildCommand ?? '⚠️ 未检测到'}
  测试命令：${detected.testCommand ?? '⚠️ 未检测到'}

以上信息是否正确？`,
      default: true,
    },
  ]);

  if (!confirmResult.confirmed) {
    // 补充修改
    const overrides = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: '项目名称：',
        default: detected.name,
      },
      {
        type: 'input',
        name: 'sourceDir',
        message: '源码目录（如 src/）：',
        default: detected.sourceDir,
      },
      {
        type: 'input',
        name: 'buildCommand',
        message: '构建命令：',
        default: detected.buildCommand ?? '',
      },
    ]);

    if (overrides.name) detected.name = overrides.name;
    if (overrides.sourceDir) detected.sourceDir = overrides.sourceDir;
    if (overrides.buildCommand) detected.buildCommand = overrides.buildCommand || undefined;
  }

  // 选择 Agent
  const agentResult = await inquirer.prompt<{
    agents: AgentRole[];
  }>([
    {
      type: 'checkbox',
      name: 'agents',
      message: '选择需要的智能体：',
      choices: [
        { name: 'dev — 核心开发（推荐）', value: 'dev', checked: true },
        { name: 'tester — 质量测试（推荐）', value: 'tester', checked: true },
        { name: 'frontend — 前端开发', value: 'frontend' },
        { name: 'pm — 产品经理', value: 'pm' },
        { name: 'designer — UI设计师', value: 'designer' },
      ],
      validate: (input: AgentRole[]) => {
        if (input.length === 0) return '请至少选择一个智能体';
        return true;
      },
    },
  ]);

  // 生成配置
  const config: ProjectConfig = {
    name: detected.name,
    codename: detected.codename,
    language: detected.language,
    framework: detected.framework,
    sourceDir: detected.sourceDir,
    buildCommand: detected.buildCommand,
    testCommand: detected.testCommand,
    installCommand: detected.installCommand,
    agents: agentResult.agents,
    projectPath: cwd,
  };

  // 创建文件
  const stateDir = path.join(cwd, '.multi-agent');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(path.join(cwd, 'doc', 'test-reports'), { recursive: true });

  // 写 config.json
  fs.writeFileSync(
    path.join(stateDir, 'config.json'),
    JSON.stringify(config, null, 2),
    'utf-8',
  );

  // AI 生成 plan.md
  const planPath = path.join(cwd, 'doc', 'plan.md');
  if (!fs.existsSync(planPath)) {
    console.log('');
    log.step('AI 正在扫描代码库并生成任务计划...');
    console.log('');

    const spinner = showSpinner('分析代码结构...');
    try {
      const plannerRunner = new AgentRunner({
        cwd,
        systemPrompt: buildPlannerSystemPrompt(config),
        maxTurns: 30,
      });

      const result = await plannerRunner.run(buildPlannerUserPrompt(config));
      spinner.stop();

      if (result.success) {
        // 检查 AI 是否已通过 Write 工具写入了 plan.md
        if (fs.existsSync(planPath)) {
          log.success('AI 已生成 doc/plan.md');
        } else {
          // AI 没有写入文件，将其输出作为 plan.md
          fs.writeFileSync(planPath, result.output, 'utf-8');
          log.success('已创建 doc/plan.md（从 AI 输出）');
        }
      } else {
        log.warn(`AI 生成 plan.md 失败：${result.error}`);
        log.info('已创建基础模板，请手动编辑 doc/plan.md');
        fs.writeFileSync(planPath, generatePlanTemplate(config), 'utf-8');
      }
    } catch (err: any) {
      spinner.stop();
      log.warn(`AI 生成失败：${err.message}`);
      log.info('已创建基础模板，请手动编辑 doc/plan.md');
      fs.writeFileSync(planPath, generatePlanTemplate(config), 'utf-8');
    }
  } else {
    log.info('doc/plan.md 已存在，跳过生成');
  }

  // 写 lessons-learned.md
  const llPath = path.join(cwd, 'doc', 'lessons-learned.md');
  if (!fs.existsSync(llPath)) {
    fs.writeFileSync(llPath, '# 经验教训库\n', 'utf-8');
    log.success('已创建 doc/lessons-learned.md');
  }

  // 写 main-log.md
  const logPath = path.join(cwd, 'doc', 'main-log.md');
  const now = formatTime();
  const logLine = `- ${now} 项目启动，${config.name}\n`;
  fs.writeFileSync(logPath, logLine, 'utf-8');

  console.log('');
  log.success('初始化完成！');
  console.log('');
  console.log(`  项目：${config.name} (${config.language}${config.framework ? ' + ' + config.framework : ''})`);
  console.log(`  智能体：${config.agents.join(', ')}`);
  console.log('');
  console.log('  下一步：');
  console.log('    1. 审查 doc/plan.md（可微调任务和验收标准）');
  console.log('    2. 运行 multi-agent-kit run 开始执行');
  console.log('');
}

// ── 辅助 ──

function checkSourceFiles(cwd: string): boolean {
  const sourcePatterns = [
    'lib', 'src', 'app', 'pages',
    'package.json', 'pubspec.yaml', 'pom.xml', 'Cargo.toml', 'setup.py', 'pyproject.toml',
  ];
  for (const p of sourcePatterns) {
    if (fs.existsSync(path.join(cwd, p))) return true;
  }

  // 检查根目录是否有源文件
  try {
    const files = fs.readdirSync(cwd);
    const sourceExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.dart', '.go', '.rs', '.vue'];
    for (const f of files) {
      const ext = path.extname(f);
      if (sourceExts.includes(ext)) return true;
    }
  } catch {
    // ignore
  }

  return false;
}

function generatePlanTemplate(config: ProjectConfig): string {
  return `# 开发计划 — ${config.name}

## 项目概述
${config.language}${config.framework ? ' + ' + config.framework : ''} 项目

## 任务列表
| # | 任务 | 状态 | 涉及文件 | 验收标准 | 备注 |
|---|------|------|----------|----------|------|
| 0 | 环境验证 + 编译检查 | ⏳ 待办 | - | 构建命令零错误 | 主Agent直接做 |
| 1 | 示例任务 | ⏳ 待办 | \`${config.sourceDir}**/*\` | 见 AC-1 | |

## 验收标准

### AC-1: 示例任务
1. 操作描述 → 期望结果
2. 操作描述 → 期望结果
3. 操作描述 → 期望结果

## 当前进度
- 正在执行：尚未开始
- 已完成：0/1
`;
}

function formatTime(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${yy}${mm}${dd} ${hh}${mi}`;
}
