import { describe, expect, it } from 'vitest';
import { planWaves } from '../src/core/waves.js';
import type { Task } from '../src/types/index.js';

function task(id: number, files: string[]): Task {
  return { id, title: `任务${id}`, status: 'pending', files, acceptanceCriteria: [], attempts: 0 };
}

describe('planWaves — Wave 分组', () => {
  it('无文件冲突的任务分到同一 Wave', () => {
    const waves = planWaves([task(1, ['a.ts']), task(2, ['b.ts']), task(3, ['c.ts'])]);
    expect(waves).toHaveLength(1);
    expect(waves[0].map(t => t.id)).toEqual([1, 2, 3]);
  });

  it('涉及同一文件的任务被分到不同 Wave', () => {
    const waves = planWaves([task(1, ['a.ts', 'b.ts']), task(2, ['b.ts']), task(3, ['c.ts'])]);
    // 任务 2 与任务 1 冲突（b.ts），被挤出；任务 3 与任务 1 无冲突可同 Wave
    expect(waves).toHaveLength(2);
    expect(waves[0].map(t => t.id)).toEqual([1, 3]);
    expect(waves[1].map(t => t.id)).toEqual([2]);
  });

  it('无文件信息的任务独占 Wave，但不阻碍其他任务并组', () => {
    const waves = planWaves([task(1, ['a.ts']), task(2, []), task(3, ['b.ts'])]);
    // 任务 2 独占（无法验证无冲突）；任务 3 与任务 1 无冲突，可同 Wave
    expect(waves.map(w => w.map(t => t.id))).toEqual([[1, 3], [2]]);
  });

  it('后续任务不与独占 Wave 合并', () => {
    const waves = planWaves([task(2, []), task(1, ['a.ts']), task(3, ['b.ts'])]);
    // 任务 2 独占；任务 1 新 Wave；任务 3 与任务 1 无冲突同 Wave
    expect(waves.map(w => w.map(t => t.id))).toEqual([[2], [1, 3]]);
  });

  it('链式冲突形成多个 Wave', () => {
    const waves = planWaves([task(1, ['a.ts']), task(2, ['a.ts']), task(3, ['a.ts'])]);
    expect(waves.map(w => w.map(t => t.id))).toEqual([[1], [2], [3]]);
  });
});
