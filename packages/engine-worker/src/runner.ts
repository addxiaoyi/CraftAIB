import type { BlockGrid, EngineEvent, EngineTask } from '@craftaib/core';
import { countMaterials, validateGrid } from '@craftaib/core';
import { serializeLitematica } from '../../cartographer-adapter/dist/index.js';
import { serializeSchematic } from '../../craftmatic-adapter/dist/index.js';

export type EngineRunner = (task: EngineTask, emit: (event: EngineEvent) => void, signal: AbortSignal) => Promise<unknown>;
export function createCoreRunner(): EngineRunner {
  return async (task, emit, signal) => {
    const grid = task.input as BlockGrid;
    if (task.type === 'grid.validate') { const valid = validateGrid(grid); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'validated' }); return { ok: true, width: valid.width, height: valid.height, length: valid.length, cells: valid.cells.length }; }
    if (task.type === 'materials.count') { validateGrid(grid); if (signal.aborted) throw new Error('Task cancelled.'); return Object.fromEntries(countMaterials(grid)); }
    if (task.type === 'schematic.serialize') { validateGrid(grid); emit({ type: 'progress', taskId: task.id, value: 0.4, stage: 'encoding schematic' }); const bytes = await serializeSchematic(grid); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'compressed' }); return bytes; }
    if (task.type === 'litematic.serialize') { validateGrid(grid); emit({ type: 'progress', taskId: task.id, value: 0.4, stage: 'encoding litematic' }); const bytes = await serializeLitematica(grid, task.options as { name?: string; author?: string; description?: string }); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'compressed' }); return bytes; }
    throw new Error(`Unsupported engine task: ${task.type}`);
  };
}

