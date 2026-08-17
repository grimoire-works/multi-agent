import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Orchestrator } from '../src/core/orchestrator.js';
import { StateManager } from '../src/core/state-manager.js';
import type { ProjectConfig } from '../src/types/index.js';

// parseTestVerdict / extractFinalVerdict 是私有方法，通过实例验证其行为
let orchestrator: Orchestrator;
let dir: string;
let reportPath: string;

const config: ProjectConfig = {
  name: 'Demo',
  codename: 'demo',
  language: 'TypeScript',
  sourceDir: 'src',
  agents: ['dev', 'tester'],
  projectPath: '/tmp/demo',
};

function parseVerdict(output: string): string {
  return (orchestrator as any).parseTestVerdict(output, reportPath);
}

beforeEach(() => {
  orchestrator = new Orchestrator(config, new StateManager(config.projectPath));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mak-verdict-'));
  reportPath = path.join(dir, `task1-report.md`);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const PASS_REPORT = `# 测试报告 - 任务 1: 用户登录

| # | 验收标准 | 结果 |
|---|---------|------|
| 1 | 输入正确账号密码 | ✅ 通过 |

### 判定：PASS
`;

/** 关键回归场景：部分 AC 通过但最终 FAIL（旧实现会因 includes('判定：PASS') 误判…实际旧实现 PASS 优先导致正反两类误判） */
const FAIL_REPORT_WITH_PASSING_ACS = `# 测试报告 - 任务 1: 订单查询

| # | 验收标准 | 结果 | 说明 |
|---|---------|------|------|
| 1 | 查询接口返回订单列表 | ✅ 通过 | |
| 2 | 空结果返回空数组 | ❌ 未通过 | 返回 null |

### 判定：FAIL

| # | 严重度 | 位置 | 原因 |
|---|--------|------|------|
| 1 | 中等 | OrderService.java:42 | 空指针风险 |
`;

describe('parseTestVerdict — 报告文件优先', () => {
  it('PASS 报告 → PASS', () => {
    fs.writeFileSync(reportPath, PASS_REPORT, 'utf-8');
    expect(parseVerdict('')).toBe('PASS');
  });

  it('部分 AC 通过但最终判定 FAIL 的报告 → FAIL（回归测试）', () => {
    fs.writeFileSync(reportPath, FAIL_REPORT_WITH_PASSING_ACS, 'utf-8');
    expect(parseVerdict('')).toBe('FAIL');
  });

  it('报告中有多个判定行时取最后一个', () => {
    fs.writeFileSync(reportPath, `### 判定：PASS\n\n补充检查后：\n\n### 判定：FAIL\n`, 'utf-8');
    expect(parseVerdict('')).toBe('FAIL');
  });
});

describe('parseTestVerdict — agent 输出兜底', () => {
  it('报告文件不存在时，从 agent 输出中提取判定行', () => {
    expect(parseVerdict(`检查完成。\n\n### 判定：PASS\n`)).toBe('PASS');
  });

  it('tester 按返回契约输出「测试结果：PASS」→ PASS（报告文件缺失时）', () => {
    expect(parseVerdict('测试结果：PASS\n报告路径：doc/test-reports/task-3-r0.md')).toBe('PASS');
  });

  it('tester 返回契约「测试结果：FAIL」→ FAIL', () => {
    expect(parseVerdict('测试结果：FAIL\n问题数量：2\n报告路径：doc/test-reports/task-3-r0.md')).toBe('FAIL');
  });

  it('自由文本不含判定行时不再默认放行 → SKIP', () => {
    expect(parseVerdict('测试完成了，大部分功能正常，个别地方有点问题。')).toBe('SKIP');
  });

  it('输出中出现「上一轮 FAIL 本轮 PASS」类叙述不会误判', () => {
    // 叙述中的 FAIL 不构成判定行，且无 ### 判定行 → SKIP
    expect(parseVerdict('上一轮 FAIL，本轮已修复，功能验证正常。')).toBe('SKIP');
  });
});
