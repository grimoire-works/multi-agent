import { describe, expect, it } from 'vitest';
import {
  replacePlaceholders,
  loadAgentPrompt,
  buildDevPrompt,
  buildTesterPrompt,
} from '../src/core/prompt-loader.js';
import type { ProjectConfig, Task } from '../src/types/index.js';

const config: ProjectConfig = {
  name: 'Demo 项目',
  codename: 'demo',
  language: 'TypeScript',
  sourceDir: 'src/',
  buildCommand: 'npm run build',
  installCommand: 'npm install',
  agents: ['dev', 'tester'],
  projectPath: '/tmp/demo',
};

const task: Task = {
  id: 3,
  title: '用户登录接口',
  status: 'pending',
  files: ['src/login.ts', 'src/auth.ts'],
  acceptanceCriteria: [
    { id: 'AC-1', operation: '输入正确账号密码', expected: '返回 token' },
    { id: 'AC-1', operation: '密码错误', expected: '返回 401' },
  ],
  attempts: 0,
};

describe('replacePlaceholders', () => {
  it('替换全部占位符', () => {
    const result = replacePlaceholders(
      '项目：{项目名称} 代号：{代号} 源码：{源代码目录} 构建：{构建命令} 安装：{依赖安装命令} 路径：{项目路径}',
      config,
    );
    expect(result).toBe('项目：Demo 项目 代号：demo 源码：src/ 构建：npm run build 安装：npm install 路径：/tmp/demo');
  });

  it('未配置的命令占位符替换为（未配置）', () => {
    const partial = { ...config, buildCommand: undefined, installCommand: undefined };
    const result = replacePlaceholders('构建：{构建命令} 安装：{依赖安装命令}', partial);
    expect(result).toBe('构建：（未配置） 安装：（未配置）');
  });

  it('同一占位符多次出现全部替换', () => {
    const result = replacePlaceholders('{项目名称} 和 {项目名称}', config);
    expect(result).toBe('Demo 项目 和 Demo 项目');
  });
});

describe('loadAgentPrompt', () => {
  it('加载 dev 模板并完成占位符替换（仓库模板完整性）', () => {
    const prompt = loadAgentPrompt('dev', config);
    expect(prompt).not.toContain('{项目名称}');
    expect(prompt).not.toContain('{代号}');
    expect(prompt).toContain('Demo 项目');
  });
});

describe('buildDevPrompt', () => {
  it('注入 AC 与涉及文件', () => {
    const prompt = buildDevPrompt(task, '');
    expect(prompt).toContain('任务 3 - 用户登录接口');
    expect(prompt).toContain('- 输入正确账号密码 → 返回 token');
    expect(prompt).toContain('- 密码错误 → 返回 401');
    expect(prompt).toContain('src/login.ts, src/auth.ts');
  });

  it('注入经验教训', () => {
    const prompt = buildDevPrompt(task, '- [EXP-001] 避免使用 require()');
    expect(prompt).toContain('- [EXP-001] 避免使用 require()');
  });
});

describe('buildTesterPrompt', () => {
  it('注入带 AC 编号的验收标准与指定报告文件名', () => {
    const prompt = buildTesterPrompt(task, 'doc/test-reports/task-3-r0.md');
    expect(prompt).toContain('- [AC-1] 输入正确账号密码 → 返回 token');
    expect(prompt).toContain('输出文件：doc/test-reports/task-3-r0.md');
  });
});

