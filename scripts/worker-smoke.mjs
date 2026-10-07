import assert from 'node:assert/strict';
import { createGrid } from '../packages/core/dist/index.js';
import { createCoreRunner, createTaskRegistry } from '../packages/engine-worker/dist/index.js';

const events = [];
const registry = createTaskRegistry((event) => events.push(event), createCoreRunner());
const grid = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'minecraft:stone' } }], { width: 1, height: 1, length: 1 });
await registry.run({ id: 'schem', type: 'schematic.serialize', input: grid });
const result = events.find((event) => event.taskId === 'schem' && event.type === 'result');
assert.equal(result.output[0], 0x1f); assert.equal(result.output[1], 0x8b);
const parseEvents = []; const parseRegistry = createTaskRegistry((event) => parseEvents.push(event), createCoreRunner()); await parseRegistry.run({ id: 'parse', type: 'schematic.parse', input: result.output }); assert.equal(parseEvents.at(-1).type, 'result'); assert.equal(parseEvents.at(-1).output.cells[0].block.id, 'minecraft:stone');
const mapEvents = []; const mapRegistry = createTaskRegistry((event) => mapEvents.push(event), createCoreRunner()); await mapRegistry.run({ id: 'map', type: 'map-art.generate', input: { width: 1, height: 1, paletteId: 'smoke', pixels: [{ r: 255, g: 255, b: 255, a: 255 }] }, options: { palette: [{ block: { id: 'minecraft:white_concrete' }, color: { r: 255, g: 255, b: 255 } }] } }); assert.equal(mapEvents.at(-1).type, 'result');
const materialEvents = []; const materialRegistry = createTaskRegistry((event) => materialEvents.push(event), createCoreRunner()); await materialRegistry.run({ id: 'materials', type: 'materials.analyze', input: grid, options: { inventory: {} } }); assert.equal(materialEvents.at(-1).output[0].missing, 1);
const renderEvents = []; const renderRegistry = createTaskRegistry((event) => renderEvents.push(event), createCoreRunner()); await renderRegistry.run({ id: 'render', type: 'render.exterior', input: grid, options: { width: 32, height: 32 } }); assert.equal(renderEvents.at(-1).output.width, 32);
console.log('worker export task tests passed');




