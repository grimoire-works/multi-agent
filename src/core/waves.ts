import type { Task } from '../types/index.js';

/**
 * Wave 任务分组（对齐 skill Teams 模式的分组原则）
 *
 * - 同一 Wave 内的任务不能涉及同一文件（防止并行写冲突）
 * - 无涉及文件信息的任务无法验证冲突，保守地独占一个 Wave
 * - 按任务号顺序贪心分配，Wave 之间保持先后依赖
 */
export function planWaves(tasks: Task[]): Task[][] {
  const waves: Task[][] = [];
  const waveFiles: Set<string>[] = [];

  for (const task of tasks) {
    // 无文件信息 → 独占 Wave（无法验证无冲突）
    if (task.files.length === 0) {
      waves.push([task]);
      waveFiles.push(new Set());
      continue;
    }

    let placed = false;
    for (let i = 0; i < waves.length; i++) {
      // 跳过独占 Wave（waveFiles 为空表示该 Wave 是无文件信息任务）
      if (waveFiles[i].size === 0) continue;

      const conflict = task.files.some(f => waveFiles[i].has(f));
      if (!conflict) {
        waves[i].push(task);
        for (const f of task.files) waveFiles[i].add(f);
        placed = true;
        break;
      }
    }

    if (!placed) {
      waves.push([task]);
      waveFiles.push(new Set(task.files));
    }
  }

  return waves;
}
