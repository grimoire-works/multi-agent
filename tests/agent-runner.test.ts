import os from 'os';
import { describe, expect, it } from 'vitest';
import { createCodingTools, createReadOnlyTools } from '@mariozechner/pi-coding-agent';
import { ALL_TOOLS } from '../src/core/agent-runner.js';

describe('ALL_TOOLS — SDK 工具命名契约', () => {
  it('每个工具名与 SDK 注册名精确匹配（大小写敏感，Glob 对应 find）', () => {
    // SDK 实际注册的工具名（createAgentSession 的 tools 参数按 Set 精确过滤，
    // 名字不匹配 = 工具被过滤 = agent 零工具空转，曾因 PascalCase 命名踩坑）
    const sdkNames = new Set(
      [...createCodingTools(os.tmpdir()), ...createReadOnlyTools(os.tmpdir())]
        .map((t: { name: string }) => t.name),
    );

    for (const name of ALL_TOOLS) {
      expect(sdkNames.has(name), `工具名 "${name}" 不在 SDK 注册名中（${[...sdkNames].join(', ')}）`).toBe(true);
    }
  });

  it('全小写，无 PascalCase 残留（无 Glob，对应名为 find）', () => {
    for (const name of ALL_TOOLS) {
      expect(name).toBe(name.toLowerCase());
    }
    expect(ALL_TOOLS).not.toContain('Glob');
    expect(ALL_TOOLS).toContain('find');
  });
});
