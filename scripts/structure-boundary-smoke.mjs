import assert from 'node:assert/strict';
import { gunzipSync, gzipSync } from 'node:zlib';
import { applyGridEdit, GridHistory, blockStateKey, createGrid, normalizeState, validateGrid } from '../packages/core/dist/index.js';
import { serializeLitematica, serializeLitematicaRegions } from '../packages/cartographer-adapter/dist/index.js';
import { flattenLitematicaDocument, fromCraftmaticSchematic, parseLitematicaBytes, parseLitematicaDocumentBytes, parseSchematicBytes, Reader, serializeSchematic, toCraftmaticSchematic, toSchematicLike } from '../packages/craftmatic-adapter/dist/index.js';
import { createCoreRunner } from '../packages/engine-worker/dist/index.js';

const logs = createGrid([
  { x: 0, y: 0, z: 0, block: { id: 'oak_log', properties: { axis: 'x' } } },
  { x: 1, y: 0, z: 0, block: { id: 'oak_log', properties: { axis: 'z' } } },
], { width: 2, height: 1, length: 1 });
assert.equal(logs.palette.length, 3, 'each distinct block state needs a palette entry');
const history = new GridHistory(logs);
const removeFirst = { type: 'remove', min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
history.apply(removeFirst);
assert.throws(() => history.apply({ type: 'fill', min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 0, z: 0 }, to: { id: 'stone' } }), /outside/);
assert.deepEqual(history.undo(), logs, 'a failed edit must not add an undo step');
assert.equal(history.redo().cells.length, 1, 'a failed edit must not clear redo history');
const directed = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'oak_stairs', properties: { facing: 'north', half: 'bottom' } } }], { width: 1, height: 1, length: 1 });
assert.equal(applyGridEdit(directed, { ...removeFirst, type: 'replace', from: { id: 'oak_stairs', properties: { half: 'bottom', facing: 'north' } }, to: { id: 'stone' } }).cells[0].block.id, 'minecraft:stone');
assert.throws(() => applyGridEdit(logs, { ...removeFirst, type: 'unknown' }), /Unknown/);
const filled = applyGridEdit(createGrid([], { width: 100, height: 10, length: 100 }), { type: 'fill', min: { x: 0, y: 0, z: 0 }, max: { x: 99, y: 9, z: 99 }, to: { id: 'stone' } });
assert.equal(filled.cells.length, 100000);
assert.equal(blockStateKey({ id: 'oak_stairs', properties: { half: 'bottom', facing: 'west' } }), blockStateKey({ id: 'minecraft:oak_stairs', properties: { facing: 'west', half: 'bottom' } }));
assert.throws(() => validateGrid({ ...logs, palette: logs.palette.slice(0, 2) }), /missing from the palette/);
assert.throws(() => validateGrid({ ...logs, origin: { x: 0.5, y: 0, z: 0 } }), /origin/);
assert.throws(() => validateGrid({ ...logs, width: Number.MAX_SAFE_INTEGER, height: 2 }), /volume/);
assert.throws(() => normalizeState({ id: 'stone', properties: { facing: false } }), /property/);
assert.throws(() => validateGrid(null), /must be an object/);
assert.throws(() => new Reader(new Uint8Array([0, 4, 65])).payload(8), /Unexpected end/);
assert.throws(() => new Reader(new Uint8Array([255, 255, 255, 255])).payload(7), /invalid length/);
assert.throws(() => new Reader(new Uint8Array([0, 0, 0, 0, 1])).payload(9), /element type/);
for (const convert of [toSchematicLike, toCraftmaticSchematic]) {
  const roundTrip = fromCraftmaticSchematic(convert(logs));
  assert.deepEqual(roundTrip.cells.map((cell) => cell.block), logs.cells.map((cell) => cell.block));
}
const schemRoundTrip = await parseSchematicBytes(await serializeSchematic(logs));
assert.deepEqual(schemRoundTrip.cells.map((cell) => cell.block), logs.cells.map((cell) => cell.block));
const wideSchematic = await parseSchematicBytes(await serializeSchematic(createGrid(logs.cells, { width: 40000, height: 1, length: 1 })));
assert.equal(wideSchematic.width, 40000, 'Sponge dimensions remain unsigned while ordinary NBT shorts are signed');
await assert.rejects(() => serializeSchematic(createGrid(logs.cells, { width: 65536, height: 1, length: 1 })), /cannot exceed 65535/);

const chest = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'minecraft:chest', properties: { facing: 'north' } } }], { width: 1, height: 1, length: 1 });
const tag = (type, value) => ({ type, value });
const compound = (value) => tag('compound', value);
chest.metadata = {
  blockEntities: [compound({ id: tag('string', 'minecraft:chest'), x: tag('int', 0), y: tag('int', 0), z: tag('int', 0),
    Items: tag('list', { type: 'compound', value: [compound({ Slot: tag('byte', 0), Count: tag('byte', 7), id: tag('string', 'minecraft:diamond') })] }),
    Values: compound({ byte: tag('byte', -2), short: tag('short', -300), int: tag('int', -40000), long: tag('long', -9223372036854775807n), float: tag('float', 1.25), double: tag('double', -3.125), bytes: tag('byteArray', new Uint8Array([0, 128, 255])), ints: tag('intArray', [1, -2]), longs: tag('longArray', [1n, -2n]), nested: tag('list', { type: 'list', value: [tag('list', { type: 'int', value: [1, 2] })] }) }),
  })],
  entities: [compound({ id: tag('string', 'minecraft:armor_stand'), Pos: tag('list', { type: 'double', value: [0.25, 0.5, 0.75] }), Rotation: tag('list', { type: 'float', value: [90, 0] }) })],
  pendingBlockTicks: [compound({ x: tag('int', 0), y: tag('int', 0), z: tag('int', 0), Block: tag('string', 'minecraft:chest'), Time: tag('long', 123n), Priority: tag('int', -1) })],
};
const sourceBytes = await serializeLitematicaRegions([{ name: 'Chest', grid: chest, position: { x: -10, y: 30, z: 5 }, dataVersion: 3700 }]);
const source = await parseLitematicaDocumentBytes(sourceBytes);
assert.equal(source.regions[0].dataVersion, 3700);
assert.equal(source.regions[0].blockEntities[0].nbt.Values.value.byte.value, -2);
assert.equal(source.regions[0].blockEntities[0].nbt.Values.value.short.value, -300);
const flattened = await parseLitematicaBytes(sourceBytes);
assert.deepEqual(flattened.origin, { x: -10, y: 30, z: 5 });
const restored = await parseLitematicaDocumentBytes(await serializeLitematica(flattened));
for (const key of ['blockEntities', 'entities', 'pendingBlockTicks']) assert.deepEqual(restored.regions[0][key], source.regions[0][key], `${key} must survive import and export including all NBT types`);
assert.deepEqual(restored.regions[0].position, flattened.origin);
assert.deepEqual(restored.regions[0].cells, source.regions[0].cells);

const offsetDocument = await parseLitematicaDocumentBytes(await serializeLitematicaRegions([
  { name: 'First', grid: chest, position: { x: -10, y: 0, z: 0 } },
  { name: 'Second', grid: chest, position: { x: -5, y: 2, z: 3 } },
]));
const offsetGrid = flattenLitematicaDocument(offsetDocument);
assert.deepEqual(offsetGrid.metadata.blockEntities.map((entry) => entry.position), [{ x: 0, y: 0, z: 0 }, { x: 5, y: 2, z: 3 }]);
assert.equal(offsetGrid.metadata.blockEntities[1].nbt.x.value, 5);
assert.deepEqual(offsetGrid.metadata.entities[1].nbt.Pos.value.value, [5.25, 2.5, 3.75]);
assert.equal(offsetGrid.metadata.pendingBlockTicks[1].nbt.z.value, 3);
const offsetRoundTrip = await parseLitematicaBytes(await serializeLitematica(offsetGrid));
assert.deepEqual(offsetRoundTrip.metadata.blockEntities, offsetGrid.metadata.blockEntities);

await assert.rejects(() => serializeLitematicaRegions([{ name: 'Same', grid: logs }, { name: 'Same', grid: logs }]), /Duplicate Litematic region/);
await assert.rejects(() => serializeLitematicaRegions([{ name: 'Wrong shape', grid: logs, size: { x: 1, y: 1, z: 2 } }]), /size must match/);
await assert.rejects(() => serializeLitematicaRegions([{ name: 'Fraction', grid: logs, position: { x: 0.5, y: 0, z: 0 } }]), /32-bit integer/);
await assert.rejects(() => serializeLitematica({ ...chest, metadata: { entities: [{}] } }), /NBT compound/);

const simple = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'minecraft:stone' } }], { width: 1, height: 1, length: 1 });
const corrupted = Buffer.from(gunzipSync(await serializeLitematica(simple)));
const statesName = Buffer.from('BlockStates');
const word = corrupted.indexOf(statesName) + statesName.length + 4;
corrupted[word + 7] = 3;
await assert.rejects(() => parseLitematicaDocumentBytes(gzipSync(corrupted)), /unknown palette index/);

const run = createCoreRunner();
const exported = await run({ id: 'current-regions', type: 'export', input: logs, options: { format: 'litematic', regions: [{ name: 'Current blocks', grid: logs, position: { x: 4, y: 5, z: 6 } }] } }, () => {}, new AbortController().signal);
const workerDocument = await parseLitematicaDocumentBytes(exported);
assert.equal(workerDocument.regions[0].name, 'Current blocks');
assert.deepEqual(workerDocument.regions[0].cells.map((cell) => cell.block), logs.cells.map((cell) => cell.block));
console.log('structure boundary smoke passed: exact states, origins, NBT entities/ticks, named regions and malformed input');
