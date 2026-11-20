import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { serializeLitematica } from '../packages/cartographer-adapter/dist/index.js';
import { parseLitematicaDocumentBytes } from '../packages/craftmatic-adapter/dist/index.js';

const compiled = await build({
  stdin: {
    contents: [
      "export * from './frontend/src/integrations/transforms.ts';",
      "export * from './frontend/src/integrations/placement.ts';",
      "export * from './frontend/src/integrations/regions.ts';",
      "export * from './frontend/src/integrations/nbt.ts';",
      "export * from './frontend/src/utils/exporters.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const { transformStructure, transformBlockState, normalizePlacement, mergePlacements, structureRegions, nbtPosition, exportLitematic } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

const structure = {
  id: 'edited-plan', name: 'Edited plan', author: 'regression', description: '', version: '1.20.4',
  size: { x: 4, y: 2, z: 3 }, origin: { x: -20, y: 10, z: -6 },
  blocks: [
    { x: 0, y: 0, z: 0, blockId: 'minecraft:oak_stairs', state: { facing: 'north', half: 'bottom', shape: 'inner_left' } },
    { x: 3, y: 1, z: 2, blockId: 'minecraft:oak_log', state: { axis: 'x' } },
    { x: 1, y: 0, z: 1, blockId: 'minecraft:chest', state: { facing: 'east', type: 'left' } },
  ],
  regions: [
    { id: 'body', name: 'body', bounds: { min: [0, 0, 0], max: [4, 1, 3] }, visible: true, locked: false, color: '#00ff00' },
    { id: 'roof', name: 'roof', bounds: { min: [0, 1, 0], max: [4, 2, 3] }, visible: true, locked: false, color: '#ff0000' },
  ],
  // Deliberately invalid: exporting the edited grid must never regenerate this old recipe.
  plan: { version: 1, name: 'stale recipe', regions: [] },
  metadata: {
    blockEntities: [{ position: { x: 1, y: 0, z: 1 }, nbt: { id: { type: 8, value: 'minecraft:chest' }, x: { type: 3, value: 1 }, y: { type: 3, value: 0 }, z: { type: 3, value: 1 }, LootTableSeed: { type: 4, value: 9234567890123n } } }],
    entities: [{ position: { x: 1.5, y: 1, z: 2.5 }, nbt: { id: { type: 8, value: 'minecraft:armor_stand' }, Pos: { type: 9, value: { type: 6, value: [1.5, 1, 2.5] } }, Rotation: { type: 9, value: { type: 5, value: [30, 0] } } } }],
  },
};
const rotated = transformStructure(structure, 'rotate90');
assert.equal(rotated.plan, undefined);
assert.deepEqual(rotated.origin, structure.origin);
assert.deepEqual(rotated.size, { x: 3, y: 2, z: 4 });
assert.deepEqual(rotated.blocks[0], { ...structure.blocks[0], x: 2, z: 0, state: { facing: 'east', half: 'bottom', shape: 'inner_left' } });
assert.equal(rotated.blocks[1].state.axis, 'z');
assert.deepEqual(rotated.regions[0].bounds, { min: [0, 0, 0], max: [3, 1, 4] });
assert.deepEqual(nbtPosition(rotated.metadata.blockEntities[0]), { x: 1, y: 0, z: 1 });
assert.deepEqual(nbtPosition(rotated.metadata.entities[0]), { x: 0.5, y: 1, z: 1.5 });
assert.equal(rotated.metadata.entities[0].nbt.Rotation.value.value[0], 120);
let fullTurn = structure;
for (let turn = 0; turn < 4; turn += 1) fullTurn = transformStructure(fullTurn, 'rotate90');
assert.deepEqual(fullTurn.blocks, structure.blocks);
assert.deepEqual(fullTurn.regions, structure.regions);
for (const transform of ['mirrorX', 'mirrorZ']) {
  const restored = transformStructure(transformStructure(structure, transform), transform);
  assert.deepEqual(restored.blocks, structure.blocks);
  assert.deepEqual(restored.metadata, structure.metadata);
}
assert.deepEqual(transformBlockState({ north: 'low', south: 'none', east: 'tall', west: 'false', rotation: '0', shape: 'north_east', hinge: 'left' }, 'mirrorZ'), { south: 'low', north: 'none', east: 'tall', west: 'false', rotation: '8', shape: 'south_east', hinge: 'right' });
assert.equal(transformBlockState({ shape: 'ascending_east' }, 'rotate90').shape, 'ascending_south');
assert.equal(transformBlockState({ shape: 'east_west' }, 'rotate90').shape, 'north_south');
assert.equal(transformBlockState({ orientation: 'north_up' }, 'rotate90').orientation, 'east_up');

const native = normalizePlacement({ name: 'native', pos: { x: -8, y: 0, z: 2 }, rotation: 'CLOCKWISE_90', mirror: 'FRONT_BACK' });
assert.deepEqual(native.position, { x: -8, y: 0, z: 2 });
assert.equal(native.rotation, 'clockwise_90');
assert.throws(() => normalizePlacement({ position: { x: Infinity, y: 0, z: 0 } }), /whole numbers/);
assert.throws(() => normalizePlacement({ mirror: 'unknown' }), /mirror/);
const large = { ...structure, plan: undefined, metadata: undefined, regions: [], size: { x: 200000, y: 1, z: 1 }, blocks: Array.from({ length: 200000 }, (_, x) => ({ x, y: 0, z: 0, blockId: 'minecraft:stone' })) };
const merged = mergePlacements(large, [normalizePlacement({ name: 'copy', position: { x: -200000, y: 0, z: 0 } })]);
assert.equal(merged.blocks.length, 400000);
assert.equal(merged.size.x, 400000);
assert.equal(merged.origin.x, structure.origin.x - 200000);

const exportedRegions = structureRegions(rotated);
assert.deepEqual(exportedRegions.map((region) => region.name), ['body', 'roof']);
assert.equal(exportedRegions.reduce((count, region) => count + region.grid.cells.length, 0), structure.blocks.length);
assert.equal(exportedRegions.flatMap((region) => region.grid.metadata?.blockEntities ?? []).length, 1);
assert.equal(exportedRegions.flatMap((region) => region.grid.metadata?.entities ?? []).length, 1);
const duplicateRegions = structureRegions({ ...structure, metadata: undefined, regions: structure.regions.map((region) => ({ ...region, name: 'same' })) });
assert.deepEqual(duplicateRegions.map((region) => region.name), ['same', 'same 2']);
const withUnassigned = structureRegions({ ...structure, metadata: undefined, regions: [structure.regions[1]] });
assert.deepEqual(withUnassigned.map((region) => region.name), ['roof', 'Unassigned structure']);

const downloads = [];
globalThis.window = { setTimeout, clearTimeout };
globalThis.document = { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } };
const originalCreateObjectURL = URL.createObjectURL;
URL.createObjectURL = (blob) => { downloads.push(blob); return originalCreateObjectURL(blob); };
globalThis.Worker = class {
  terminate() {}
  async postMessage(task) {
    assert.equal(task.type, 'export');
    assert.equal(task.options.format, 'litematic');
    try {
      const bytes = await serializeLitematica(task.input, task.options);
      this.onmessage({ data: { taskId: task.id, type: 'result', output: bytes } });
    } catch (error) { this.onerror({ message: error.message }); }
  }
};
try {
  await exportLitematic(rotated);
  const document = await parseLitematicaDocumentBytes(new Uint8Array(await downloads[0].arrayBuffer()));
  assert.deepEqual(document.regions.map((region) => region.name), ['body', 'roof']);
  const cells = document.regions.flatMap((region) => region.cells).map((cell) => ({ x: cell.x, y: cell.y, z: cell.z, blockId: cell.block.id, state: cell.block.properties }));
  const expected = rotated.blocks.map((block) => ({ ...block, x: block.x + rotated.origin.x, y: block.y + rotated.origin.y, z: block.z + rotated.origin.z }));
  const sort = (blocks) => blocks.sort((left, right) => left.x - right.x || left.y - right.y || left.z - right.z);
  assert.deepEqual(sort(cells), sort(expected));
  assert.equal(document.regions.flatMap((region) => region.blockEntities).length, 1);
  assert.equal(document.regions.flatMap((region) => region.entities).length, 1);
  assert.equal(document.regions.flatMap((region) => region.blockEntities)[0].nbt.LootTableSeed.value, 9234567890123n);
} finally { URL.createObjectURL = originalCreateObjectURL; }

console.log(JSON.stringify({ transforms: true, directionalStates: true, namedRegions: true, editedLitematicRoundTrip: true, nbtRoundTrip: true, mergedBlocks: merged.blocks.length }));
