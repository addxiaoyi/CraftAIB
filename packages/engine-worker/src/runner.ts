import type { BlockGrid, EngineEvent, EngineTask } from '@craftaib/core';
import { countMaterials, validateGrid } from '@craftaib/core';

export type EngineRunner = (task: EngineTask, emit: (event: EngineEvent) => void, signal: AbortSignal) => Promise<unknown>;

export function createCoreRunner(): EngineRunner {
  return async (task, emit, signal) => {
    if (task.type === 'grid.validate') { const grid = validateGrid(task.input as BlockGrid); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'validated' }); return { ok: true, width: grid.width, height: grid.height, length: grid.length, cells: grid.cells.length }; }
    if (task.type === 'materials.count') { const grid = validateGrid(task.input as BlockGrid); if (signal.aborted) throw new Error('Task cancelled.'); return Object.fromEntries(countMaterials(grid)); }
    throw new Error(`Unsupported engine task: ${task.type}`);
  };
}
