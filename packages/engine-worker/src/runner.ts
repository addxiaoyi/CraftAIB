import type { BlockGrid, EngineEvent, EngineTask } from '@craftaib/core';
import { planBuilding, planBuildingFromReference, planBuildingWithModel, planBuildingWithVision, structurePlanToGrid, structurePlanToRegionGrids } from '../../ai-planner/dist/index.js';
import { analyzeMaterials, applyGridEdit, countMaterials, createGrid, mergeScenes, parseCheckpoint, renderCutaway, sceneToGrid, setLayerOffset, setLayerVisibility, toggleLayerVisibility, renderExterior, renderFloor, serializeCheckpoint, validateGrid } from '@craftaib/core';
import { generateMapArt, serializeLitematica, serializeLitematicaRegions } from '../../cartographer-adapter/dist/index.js';
import { createHtmlSceneViewer, createHtmlViewer, createTexturedHtmlViewer, defaultLDrawColorBlocks, generateStructure, geoJsonToScene, geoPoisToBlockGrid, geoSceneToBlockGrid, legoSceneToBlockGrid, ldrawToBlockGrid, ldrawToScene, loadLegoModel, parseLDraw, parseLitematicaBytes, parseLitematicaDocumentBytes, parseLitematicaPlacements, parseSchematicBytes, searchLegoCatalog, serializeGlb, serializeSchematic, summarizeLitematicaDocument } from '../../craftmatic-adapter/dist/index.js';

export type EngineRunner = (task: EngineTask, emit: (event: EngineEvent) => void, signal: AbortSignal) => Promise<unknown>;
export function createCoreRunner(): EngineRunner {
  return async (task, emit, signal) => {
    const grid = task.input as BlockGrid;
    if (task.type === 'ai.plan-building') { emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'planning building' }); return planBuilding(task.input as any); }
    if (task.type === 'ai.reference-building') { emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'analyzing reference image' }); const plan = planBuildingFromReference(task.input as any); emit({ type: 'progress', taskId: task.id, value: 0.6, stage: 'generating blocks' }); return structurePlanToGrid(plan); }
    if (task.type === 'ai.reference-building-vision') { emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'calling vision planner' }); const input = task.input as any; const plan = await planBuildingWithVision(input, (task.options ?? {}) as any); emit({ type: 'progress', taskId: task.id, value: 0.6, stage: 'generating regions' }); return structurePlanToGrid(plan); }
    if (task.type === 'ai.structure-plan') { const input = task.input as any; const referenceImage = input.referenceImage ? { width: input.referenceImage.width, height: input.referenceImage.height, dataUrl: input.referenceImage.dataUrl, sourceName: input.referenceImage.sourceName } : undefined; const request = { prompt: input.prompt, seed: input.seed, constraints: input.constraints, referenceImage }; emit({ type: 'progress', taskId: task.id, value: 0.15, stage: referenceImage ? 'sending original reference image to unified model' : 'waiting for building model plan' }); const response = await fetch('/api/ai/structure-plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal }); let payload: any; try { payload = await response.json(); } catch { throw Object.assign(new Error(`The planning service returned an unreadable response (HTTP ${response.status}).`), { code: 'INVALID_MODEL_RESPONSE', statusCode: response.status }); } if (!response.ok || payload?.ok !== true) { const failure = payload?.error ?? {}; throw Object.assign(new Error(failure.message || `AI planning request failed (HTTP ${response.status}).`), { code: failure.code || 'MODEL_REQUEST_FAILED', statusCode: response.status }); } emit({ type: 'progress', taskId: task.id, value: 0.7, stage: 'building deduplicated voxel grid' }); const plan = payload.plan; const grid = structurePlanToGrid(plan); emit({ type: 'progress', taskId: task.id, value: 0.88, stage: 'summarizing named Regions' }); const regions = plan.regions.map((region: any) => ({ name: region.name, position: { x: region.x, y: region.y, z: region.z }, size: { x: region.width, y: region.height, z: region.length } })); emit({ type: 'progress', taskId: task.id, value: 0.96, stage: 'loading Viewer preview' }); return { plan, grid, regions, source: 'ai' }; }
    if (task.type === 'ai.local-structure-plan') { const input = task.input as any; emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'planning local preview' }); const plan = input?.referenceImage ? planBuildingFromReference(input) : planBuilding(input); emit({ type: 'progress', taskId: task.id, value: 0.7, stage: 'building deduplicated voxel grid' }); const grid = structurePlanToGrid(plan); emit({ type: 'progress', taskId: task.id, value: 0.88, stage: 'summarizing named Regions' }); const regions = plan.regions.map((region: any) => ({ name: region.name, position: { x: region.x, y: region.y, z: region.z }, size: { x: region.width, y: region.height, z: region.length } })); emit({ type: 'progress', taskId: task.id, value: 0.96, stage: 'loading Viewer preview' }); return { plan, grid, regions, source: 'local' }; }
    if (task.type === 'ai.export-plan-litematic') { const plan = task.input as any; emit({ type: 'progress', taskId: task.id, value: 0.4, stage: 'encoding named regions' }); return serializeLitematicaRegions(structurePlanToRegionGrids(plan), { name: plan.name, author: 'CraftAIB', description: 'Generated from an AI StructurePlan.' }); }
    if (task.type === 'ai.generate-litematic') { emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'planning named regions' }); const plan = planBuilding(task.input as any); emit({ type: 'progress', taskId: task.id, value: 0.6, stage: 'encoding litematic regions' }); return serializeLitematicaRegions(structurePlanToRegionGrids(plan), { name: plan.name, author: 'CraftAIB', description: 'Generated from an AI StructurePlan.' }); }
    if (task.type === 'ai.generate-building') { emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'planning building' }); const plan = planBuilding(task.input as any); emit({ type: 'progress', taskId: task.id, value: 0.6, stage: 'generating blocks' }); return structurePlanToGrid(plan); }
    if (task.type === 'structure.generate') { emit({ type: 'progress', taskId: task.id, value: 0.1, stage: 'generating structure' }); const generated = await generateStructure(task.options as any); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'generated' }); return generated; }
    if (task.type === 'geo.geojson') { return geoSceneToBlockGrid(geoJsonToScene(task.input, task.options as any)); }
    if (task.type === 'geo.poi') { return geoPoisToBlockGrid(task.input as any); }
    if (task.type === 'scene.layer.remove') { const scene = task.input as any; const id = String((task.options as any)?.layerId); const layers = (scene.layers ?? []).filter((layer: any) => layer.id !== id); const keep = new Set(layers.map((layer: any) => layer.gridIndex)); return { ...scene, grids: scene.grids.filter((_: any, index: number) => keep.has(index)), layers: layers.map((layer: any, index: number) => ({ ...layer, gridIndex: index })) }; }
    if (task.type === 'scene.layer.offset') { return setLayerOffset(task.input as any, String((task.options as any)?.layerId), (task.options as any)?.offset ?? { x: 0, y: 0, z: 0 }); }
    if (task.type === 'scene.to-grid') { return sceneToGrid(task.input as any); }
    if (task.type === 'scene.layer.rename') { const { renameLayer } = await import('@craftaib/core'); return renameLayer(task.input as any, String((task.options as any)?.layerId), String((task.options as any)?.name ?? '')); }
    if (task.type === 'scene.layer.toggle') { return toggleLayerVisibility(task.input as any, String((task.options as any)?.layerId)); }
    if (task.type === 'scene.layer.visibility') { return setLayerVisibility(task.input as any, String((task.options as any)?.layerId), Boolean((task.options as any)?.visible)); }
    if (task.type === 'scene.merge') { return mergeScenes((task.input as any)?.scenes ?? [], (task.options as any)?.offsets); }
    if (task.type === 'geo.blockgrid') { return geoSceneToBlockGrid(task.input as any); }
    if (task.type === 'lego.colors') { return defaultLDrawColorBlocks(); }
    if (task.type === 'lego.blockgrid') { return ldrawToBlockGrid((task.input as any)?.bricks ?? [], { colorBlocks: defaultLDrawColorBlocks(), ...(task.options as any) }); }
    if (task.type === 'lego.load') { const resource = (task.input as any)?.resource ?? task.input; return loadLegoModel(resource, async (url) => { const response = await fetch(url); if (!response.ok) throw new Error(`Unable to load LEGO model: ${response.status}`); return response.text(); }); }
    if (task.type === 'lego.resource.resolve') { const input = task.input as any; return { resource: input.resource, resolved: input.sources?.[input.resource.set_num] ?? input.sources?.[input.resource.set_num.replace(/-\d+$/, '')] ?? input.resource }; }
    if (task.type === 'lego.scene-grid') { return legoSceneToBlockGrid(task.input as any, task.options as any); }
    if (task.type === 'lego.scene') { return ldrawToScene((task.input as any)?.bricks ?? []); }
    if (task.type === 'lego.parse') { return parseLDraw(String(task.input ?? '')); }
    if (task.type === 'lego.search') { return searchLegoCatalog(task.input as any, String((task.options as any)?.query ?? ''), Number((task.options as any)?.limit ?? 24)); }
    if (task.type === 'checkpoint.save') { return serializeCheckpoint(validateGrid(grid)); }
    if (task.type === 'checkpoint.load') { return parseCheckpoint(String(task.input ?? '')); }
    if (task.type === 'grid.edit') { return applyGridEdit(grid, task.options as any); }
    if (task.type === 'export') {
      const format = (task.options as any)?.format;
      validateGrid(grid);
      emit({ type: 'progress', taskId: task.id, value: 0.2, stage: `encoding ${format}` });
      if (signal.aborted) throw new Error('Task cancelled.');
      let output: unknown;
      if (format === 'schem') output = await serializeSchematic(grid);
      else if (format === 'litematic') output = await serializeLitematica(grid, (task.options as any));
      else if (format === 'glb') output = serializeGlb(grid);
      else if (format === 'html') output = createHtmlViewer(grid);
      else throw new Error(`Unsupported export format: ${format}`);
      emit({ type: 'progress', taskId: task.id, value: 1, stage: 'exported' });
      return output;
    }    if (task.type === 'grid.validate') { const valid = validateGrid(grid); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'validated' }); return { ok: true, width: valid.width, height: valid.height, length: valid.length, cells: valid.cells.length }; }
    if (task.type === 'materials.analyze') { validateGrid(grid); return analyzeMaterials(grid, (task.options as any)?.inventory ?? {}, (task.options as any)?.rules ?? {}); }
    if (task.type === 'materials.count') { validateGrid(grid); if (signal.aborted) throw new Error('Task cancelled.'); return Object.fromEntries(countMaterials(grid)); }
    if (task.type === 'glb.serialize') { validateGrid(grid); return serializeGlb(grid); }
    if (task.type === 'viewer.scene.html') { return createHtmlSceneViewer(task.input as any); }
    if (task.type === 'viewer.html') { validateGrid(grid); return createHtmlViewer(grid); }
    if (task.type === 'viewer.textured-html') { validateGrid(grid); return createTexturedHtmlViewer(grid, task.options as any); }
    if (task.type === 'render.floor') { validateGrid(grid); return renderFloor(grid, task.options as any); }
    if (task.type === 'render.cutaway') { validateGrid(grid); return renderCutaway(grid, task.options as any); }
    if (task.type === 'render.exterior') { validateGrid(grid); return renderExterior(grid, task.options as any); }
    if (task.type === 'map-art.generate') { emit({ type: 'progress', taskId: task.id, value: 0.1, stage: 'matching palette' }); const result = generateMapArt(task.input as any, task.options as any); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'generated' }); return result; }
    if (task.type === 'image.pixel-art') { const input = task.input as any; emit({ type: 'progress', taskId: task.id, value: 0.5, stage: 'normalizing pixel-art grid' }); const result = createGrid(input.cells ?? [], { width: input.width, height: input.height, length: input.length ?? 1 }, 'voxelartcraft'); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'normalized' }); return result; }
    if (task.type === 'litematic.placements.parse') { return parseLitematicaPlacements(String(task.input ?? '')); }
    if (task.type === 'litematic.inspect') { emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'reading litematic metadata' }); const document = await parseLitematicaDocumentBytes(task.input as Uint8Array); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'inspected' }); return summarizeLitematicaDocument(document); }
    if (task.type === 'litematic.parse') { emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'reading litematic' }); const result = await parseLitematicaBytes(task.input as Uint8Array); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'parsed' }); return result; }
    if (task.type === 'schematic.parse') { emit({ type: 'progress', taskId: task.id, value: 0.2, stage: 'reading schematic' }); const result = await parseSchematicBytes(task.input as Uint8Array); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'parsed' }); return result; }
    if (task.type === 'schematic.serialize') { validateGrid(grid); emit({ type: 'progress', taskId: task.id, value: 0.4, stage: 'encoding schematic' }); const bytes = await serializeSchematic(grid); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'compressed' }); return bytes; }
    if (task.type === 'litematic.serialize') { validateGrid(grid); emit({ type: 'progress', taskId: task.id, value: 0.4, stage: 'encoding litematic' }); const bytes = await serializeLitematica(grid, task.options as { name?: string; author?: string; description?: string }); emit({ type: 'progress', taskId: task.id, value: 1, stage: 'compressed' }); return bytes; }
    throw new Error(`Unsupported engine task: ${task.type}`);
  };
}

