import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import type { ProjectConfig, AgentRole } from '../types/index.js';
import { log } from '../core/console.js';

type Platform = 'cursor' | 'trae' | 'codex';

interface PlatformConfig {
  name: string;
  outputDir: string;
  fileExt: string;
}

const PLATFORM_MAP: Record<Platform, PlatformConfig> = {
  cursor: {
    name: 'Cursor',
    outputDir: '.cursor/rules',
    fileExt: '.mdc',
  },
  trae: {
    name: 'Trae',
    outputDir: '.trae/rules',
    fileExt: '.md',
  },
  codex: {
    name: 'Codex',
    outputDir: '.',
    fileExt: '.md',
  },
};

const AGENT_PROMPT_MAP: Record<AgentRole, string> = {
  dev: 'dev-agent.md',
  tester: 'tester-agent.md',
  frontend: 'frontend-agent.md',
  pm: 'pm-agent.md',
  designer: 'designer-agent.md',
};

/**
 * setup 命令：读取 config，替换占位符，生成平台 rules 文件
 */
export async function setupCommand(projectDir?: string): Promise<void> {
  const cwd = projectDir ? path.resolve(projectDir) : process.cwd();
  const configPath = path.join(cwd, '.multi-agent', 'config.json');

  if (!fs.existsSync(configPath)) {
    log.error('未找到配置文件。请先运行 multi-agent-kit init');
    process.exit(1);
  }

  const config: ProjectConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // 选择平台
  const { platform } = await inquirer.prompt<{
    platform: Platform;
  }>([
    {
      type: 'list',
      name: 'platform',
      message: '选择目标平台：',
      choices: [
        { name: 'Cursor（.cursor/rules/*.mdc）', value: 'cursor' },
        { name: 'Trae（.trae/rules/*.md）', value: 'trae' },
        { name: 'Codex（instructions.md）', value: 'codex' },
      ],
    },
  ]);

  const platformConfig = PLATFORM_MAP[platform];
  const outputDir = path.join(cwd, platformConfig.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  // 查找 templates 目录
  const templatesDir = findTemplatesDir();

  if (!templatesDir) {
    log.error('未找到 templates/ 目录。请确认 multi-agent-kit 项目完整性。');
    process.exit(1);
  }

  // 读取并替换每个选中的 agent prompt
  let generated = 0;
  for (const role of config.agents) {
    const filename = AGENT_PROMPT_MAP[role];
    const templatePath = path.join(templatesDir, filename);

    if (!fs.existsSync(templatePath)) {
      log.warn(`跳过 ${role}：未找到模板 ${filename}`);
      continue;
    }

    const template = fs.readFileSync(templatePath, 'utf-8');
    const content = replacePlaceholders(template, config);

    // Codex 特殊处理：所有 prompt 合并到一个 instructions.md
    if (platform === 'codex') {
      const outputPath = path.join(outputDir, `${role}-agent${platformConfig.fileExt}`);
      fs.writeFileSync(outputPath, content, 'utf-8');
      log.success(`已生成 ${platformConfig.outputDir}/${role}-agent${platformConfig.fileExt}`);
    } else {
      const outputPath = path.join(outputDir, `${config.codename}-${role}${platformConfig.fileExt}`);
      fs.writeFileSync(outputPath, content, 'utf-8');
      log.success(`已生成 ${platformConfig.outputDir}/${config.codename}-${role}${platformConfig.fileExt}`);
    }
    generated++;
  }

  console.log('');
  log.success(`已生成 ${generated} 个文件到 ${platformConfig.outputDir}/`);
  console.log('');
  console.log(`  在 ${platformConfig.name} 中直接说"按开发模式工作流程执行"即可使用。`);
  console.log('');
}

/**
 * 在 init 中集成 setup 询问
 */
export async function askSetup(
  config: ProjectConfig,
  cwd: string,
): Promise<void> {
  const { wantSetup } = await inquirer.prompt<{
    wantSetup: boolean;
  }>([
    {
      type: 'confirm',
      name: 'wantSetup',
      message: '是否生成平台规则文件？（将 prompt 替换占位符后配置到 Cursor/Trae/Codex）',
      default: false,
    },
  ]);

  if (wantSetup) {
    await setupCommand(cwd);
  }
}

// ── 辅助 ──

function findTemplatesDir(): string | null {
  // 相对于 dist/ 目录向上查找 templates/
  // dist/commands/setup.js → ../../templates/
  const possiblePaths = [
    path.resolve(process.argv[1] ?? __dirname, '..', '..', 'templates'),
    path.resolve(process.cwd(), 'templates'),
    path.resolve(__dirname, '..', '..', 'templates'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function replacePlaceholders(template: string, config: ProjectConfig): string {
  return template
    .replace(/\{项目名称\}/g, config.name)
    .replace(/\{代号\}/g, config.codename)
    .replace(/\{源代码目录\}/g, config.sourceDir)
    .replace(/\{构建命令\}/g, config.buildCommand ?? '（未配置）')
    .replace(/\{依赖安装命令\}/g, config.installCommand ?? '（未配置）')
    .replace(/\{项目路径\}/g, config.projectPath);
}
