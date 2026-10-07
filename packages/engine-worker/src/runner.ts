import type { BlockGrid, EngineEvent, EngineTask } from '@craftaib/core';
import { analyzeMaterials, applyGridEdit, countMaterials, renderCutaway, renderExterior, renderFloor, validateGrid } from '@craftaib/core';
import { generateMapArt, serializeLitematica } from '../../cartographer-adapter/dist/index.js';
import { createHtmlViewer, legoSceneToBlockGrid, ldrawToBlockGrid, ldrawToScene, parseLDraw, parseLitematicaBytes, parseSchematicBytes, searchLegoCatalog, serializeGlb, serializeSchematic } from '../../craftmatic-adapter/dist/index.js';

export type EngineRunner = (task: EngineTask, emit: (event: EngineEvent) => void, signal: AbortSignal) => Promise<unknown>;
export function createCoreRunner(): EngineRunner {
  return async (task, emit, signal) => {
    const grid = task.input as BlockGrid;
    if (task.type === 'lego.blockgrid') { return ldrawToBlockGrid((task.input as any)?.bricks ?? [], task.options as any); }
    if (task.type === 'lego.resource.resolve') { const input = task.input as any; return { resource: input.resource, resolved: input.sources?.[input.resource.set_num] ?? input.sources?.[input.resource.set_num.replace(/-\d+$/, '')] ?? input.resource }; }
    if (task.type === 'lego.scene-grid') { return legoSceneToBlockGrid(task.input as any, task.options as any); }
    if (task.type === 'lego.scene') { return ldrawToScene((task.input as any)?.bricks ?? []); }
    if (task.type === 'lego.parse') { return parseLDraw(String(task.input ?? '')); }
    if (task.type === 'lego.search') { return searchLegoCatalog(task.input as any, String((task.options as any)?.query ?? ''), Number((task.options as any)?.limit ?? 24)); }
    if (task.type === 'grid.edit') { return applyGridEdit(grid, task.options as any); }
    if (task.type === 'grid.validate') { const valid = validateGrid(grid); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'validated' }); return { ok: true, width: valid.width, height: valid.height, length: valid.length, cells: valid.cells.length }; }
    if (task.type === 'materials.analyze') { validateGrid(grid); return analyzeMaterials(grid, (task.options as any)?.inventory ?? {}, (task.options as any)?.rules ?? {}); }
    if (task.type === 'materials.count') { validateGrid(grid); if (signal.aborted) throw new Error('Task cancelled.'); return Object.fromEntries(countMaterials(grid)); }
    if (task.type === 'glb.serialize') { validateGrid(grid); return serializeGlb(grid); }
    if (task.type === 'viewer.html') { validateGrid(grid); return createHtmlViewer(grid); }
    if (task.type === 'render.floor') { validateGrid(grid); return renderFloor(grid, task.options as any); }
    if (task.type === 'render.cutaway') { validateGrid(grid); return renderCutaway(grid, task.options as any); }
    if (task.type === 'render.exterior') { validateGrid(grid); return renderExterior(grid, task.options as any); }
    if (task.type === 'map-art.generate') { emit({ type: 'progress', taskId: task.id, value: 0.1, stage: 'matching palette' }); const result = generateMapArt(task.input as any, task.options as any); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'generated' }); return result; }
    if (task.type === 'litematic.parse') { emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'reading litematic' }); const result = await parseLitematicaBytes(task.input as Uint8Array); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'parsed' }); return result; }
    if (task.type === 'schematic.parse') { emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'reading schematic' }); const result = await parseSchematicBytes(task.input as Uint8Array); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'parsed' }); return result; }
    if (task.type === 'schematic.serialize') { validateGrid(grid); emit({ type: 'progress', taskId: task.id, value: 0.4, stage: 'encoding schematic' }); const bytes = await serializeSchematic(grid); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'compressed' }); return bytes; }
    if (task.type === 'litematic.serialize') { validateGrid(grid); emit({ type: 'progress', taskId: task.id, value: 0.4, stage: 'encoding litematic' }); const bytes = await serializeLitematica(grid, task.options as { name?: string; author?: string; description?: string }); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'compressed' }); return bytes; }
    throw new Error(`Unsupported engine task: ${task.type}`);
  };
}

















