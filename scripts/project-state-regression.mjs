import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createCoreRunner } from '../packages/engine-worker/dist/index.js';
import { serializeCheckpoint, parseCheckpoint, createProject, serializeProject, parseProject } from '../packages/core/dist/index.js';

const compiled = await build({
  stdin: {
    contents: "export * from './frontend/src/integrations/project.ts'; export * from './frontend/src/integrations/storage.ts'; export * from './frontend/src/integrations/engine.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const structure = {
  id: 'chest', name: 'NBT fixture', description: '', author: 'regression', version: '1.20.4',
  size: { x: 2, y: 1, z: 1 }, origin: { x: -12, y: 64, z: 3 }, regions: [],
  blocks: [{ x: 0, y: 0, z: 0, blockId: 'minecraft:chest', state: { facing: 'east' } }],
  metadata: { blockEntities: [{ nbt: { LootTableSeed: { type: 4, value: 9223372036854775807n }, Map: { type: 7, value: new Uint8Array([0, 128, 255]) } } }] },
};
const project = { version: 1, structure, activeWorkspace: 'viewer_3d', language: 'en', autoSave: true, savedAt: new Date().toISOString() };
assert.deepEqual(api.validateProject(api.parseProjectJson(api.stringifyProjectJson(project))), project);
assert.deepEqual(api.structureToGrid(structure).origin, structure.origin);
assert.deepEqual(api.gridToStructure(api.structureToGrid(structure)).origin, structure.origin);
const clipped = api.gridToStructure({ ...api.structureToGrid(structure), width: 10 }, { regions: [{ name: 'clipped', position: { x: -3, y: 0, z: 0 }, dimensions: { x: 5, y: 1, z: 1 } }] });
assert.deepEqual(clipped.regions[0].bounds, { min: [0, 0, 0], max: [2, 1, 1] });
globalThis.window = { setTimeout, clearTimeout };
const runner = createCoreRunner();
globalThis.Worker = class {
  postMessage(task) {
    runner(task, () => {}, new AbortController().signal).then(
      (output) => this.onmessage({ data: { taskId: task.id, type: 'result', output } }),
      (error) => this.onmessage({ data: { taskId: task.id, type: 'error', message: error.message, code: 'TASK_FAILED' } }),
    );
  }
  terminate() {}
};
const grid = api.structureToGrid(structure);
assert.deepEqual(parseCheckpoint(serializeCheckpoint(grid)), grid);
const engineProject = { ...createProject('NBT project'), grid };
assert.deepEqual(parseProject(serializeProject(engineProject)).grid, grid);
const exportedJson = await runner({ id: 'json-export', type: 'export', input: grid, options: { format: 'json' } }, () => {}, new AbortController().signal);
assert.deepEqual(api.parseProjectJson(exportedJson), grid);
assert.deepEqual((await api.decodeStructureFile(new File([api.stringifyProjectJson(grid)], 'chest.json'))).blocks, structure.blocks);
await assert.rejects(() => api.decodeStructureFile(new File([JSON.stringify({ ...grid, metadata: undefined, cells: [{ ...grid.cells[0], x: 2 }] })], 'invalid.json')), /outside/);
assert.throws(() => api.validateProject({ ...project, structure: { ...structure, regions: undefined } }), /regions/);
assert.throws(() => api.validateStructure({ ...structure, blocks: [structure.blocks[0], structure.blocks[0]] }), /Duplicate/);
assert.throws(() => api.validateStructure({ ...structure, blocks: [{ ...structure.blocks[0], x: 2 }] }), /outside/);
assert.throws(() => api.validateStructure({ ...structure, blocks: [{ ...structure.blocks[0], state: { facing: 4 } }] }), /state/);
assert.throws(() => api.validateProject({ ...project, materialInventory: { 'minecraft:stone': -1 } }), /integer/);
assert.throws(() => api.validateProject({ ...project, placements: [null] }), /object/);
assert.throws(() => api.validateProject({ ...project, ai: { prompt: {}, referenceImage: 3 } }), /text/);
assert.throws(() => api.validateProject({ ...project, activeWorkspace: 'unknown' }), /workspace/);
assert.throws(() => api.validateStructure({ ...structure, plan: { version: 1, name: 'invalid', regions: [], notes: 'not an array' } }), /notes/);
assert.throws(() => api.parseProjectJson('{"$craftaibBigInt":"12.4"}'), /integer metadata/);
assert.throws(() => api.parseProjectJson('{"$craftaibBytes":[256]}'), /byte metadata/);

const saved = new Map();
const storage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: (key) => saved.delete(key) };
const reloadSnapshot = { ...project, autoSave: false, ai: { prompt: 'unsaved prompt' }, history: [structure] };
api.saveReloadSnapshot(storage, reloadSnapshot);
assert.deepEqual(api.takeReloadSnapshot(storage), reloadSnapshot);
assert.equal(api.takeReloadSnapshot(storage), null);
saved.set('craftaib.reload-snapshot', api.stringifyProjectJson({ version: 1, structure }));
assert.throws(() => api.takeReloadSnapshot(storage), /Incomplete/);
assert.throws(() => api.saveReloadSnapshot({ setItem() { throw new Error('Quota exceeded'); } }, reloadSnapshot), /Quota exceeded/);
assert.deepEqual(api.persistWorkbench(storage, { ...project, ai: { prompt: '' }, history: [structure] }), []);
assert.deepEqual(api.restoreWorkbench(storage).structure, structure);
assert.equal(api.restoreWorkbench(storage).warnings.length, 0);
saved.set('blockcraft_current_structure', '{"size":1}');
const recovered = api.restoreWorkbench(storage);
assert.ok(recovered.warnings.length);
assert.ok(api.validateStructure(recovered.structure));
const denied = api.restoreWorkbench({ getItem() { throw new Error('Storage denied'); } });
assert.ok(denied.warnings.length);
assert.ok(api.validateStructure(denied.structure));

const quotaStorage = {
  ...storage,
  setItem(key, value) {
    if (key === 'craftaib.ai-meta' && value.includes('referenceImage')) throw new Error('Quota exceeded');
    saved.set(key, value);
  },
};
assert.ok(api.persistWorkbench(quotaStorage, { ...project, ai: { prompt: 'keep this', referenceImage: 'large image' } }).length);
assert.deepEqual(api.parseProjectJson(saved.get('craftaib.ai-meta')), { prompt: 'keep this' });
assert.deepEqual(api.parseProjectJson(saved.get('blockcraft_current_structure')), structure);
api.persistWorkbench(storage, { ...project, autoSave: false, structure: { ...structure, name: 'unsaved' } });
assert.equal(api.parseProjectJson(saved.get('blockcraft_current_structure')).name, structure.name);

saved.clear();
const writes = [];
const tracked = { ...storage, setItem(key, value) { writes.push(key); storage.setItem(key, value); } };
const persisted = {};
const snapshot = { ...project, ai: { prompt: 'first' }, history: [structure] };
api.persistWorkbench(tracked, snapshot, persisted);
writes.length = 0;
api.persistWorkbench(tracked, { ...snapshot, ai: { prompt: 'next' }, language: 'zh' }, persisted);
assert.deepEqual(writes.sort(), ['craftaib.ai-meta', 'craftaib.language']);

saved.clear();
saved.set('blockcraft_current_structure', api.stringifyProjectJson({ ...structure, metadata: undefined, name: 'old' }));
saved.set('craftaib.ai-meta', JSON.stringify({ prompt: 'old', referenceImage: 'x'.repeat(1200) }));
const capacity = api.stringifyProjectJson(structure).length + 180;
const bounded = { ...storage, setItem(key, value) {
  const bytes = [...saved.entries()].filter(([name]) => name !== key).reduce((total, [, text]) => total + text.length, 0) + value.length;
  if (bytes > capacity) throw new Error('Quota exceeded');
  saved.set(key, value);
} };
assert.ok(api.persistWorkbench(bounded, { ...project, ai: { prompt: 'new' }, history: [] }).length);
assert.deepEqual(api.parseProjectJson(saved.get('blockcraft_current_structure')), structure);
assert.deepEqual(api.parseProjectJson(saved.get('craftaib.ai-meta')), { prompt: 'new' });
console.log('Project state regression passed: validation, NBT longs, origins, denied storage, quota recovery and autosave opt-out.');
