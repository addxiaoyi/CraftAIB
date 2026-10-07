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
const editEvents = []; const editRegistry = createTaskRegistry((event) => editEvents.push(event), createCoreRunner()); await editRegistry.run({ id: 'edit', type: 'grid.edit', input: grid, options: { type: 'replace', min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, from: { id: 'minecraft:stone' }, to: { id: 'minecraft:gold_block' } } }); assert.equal(editEvents.at(-1).output.cells[0].block.id, 'minecraft:gold_block');
const legoEvents = []; const legoRegistry = createTaskRegistry((event) => legoEvents.push(event), createCoreRunner()); await legoRegistry.run({ id: 'lego', type: 'lego.search', input: { sets: [{ set_num: '10354-1', name: 'Hogwarts Castle', year: 2026, theme_id: 1, num_parts: 5000 }] }, options: { query: 'hogwarts', limit: 5 } }); assert.equal(legoEvents.at(-1).output[0].set_num, '10354-1');
const ldrawEvents = []; const ldrawRegistry = createTaskRegistry((event) => ldrawEvents.push(event), createCoreRunner()); await ldrawRegistry.run({ id: 'ldraw', type: 'lego.parse', input: `0 FILE model.ldr\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat` }); assert.equal(ldrawEvents.at(-1).output.bricks[0].part, '3001.dat');
const legoSceneEvents = []; const legoSceneRegistry = createTaskRegistry((event) => legoSceneEvents.push(event), createCoreRunner()); await legoSceneRegistry.run({ id: 'lego-scene', type: 'lego.scene', input: ldrawEvents.at(-1).output }); assert.equal(legoSceneEvents.at(-1).output.metadata.brickCount, 1);
const resourceEvents = []; const resourceRegistry = createTaskRegistry((event) => resourceEvents.push(event), createCoreRunner()); await resourceRegistry.run({ id: 'resource', type: 'lego.resource.resolve', input: { resource: { set_num: '10354-1', source: 'rebrickable' }, sources: { '10354': { set_num: '10354-1', source: 'omr', modelUrl: '/omr/10354.ldr' } } } }); assert.equal(resourceEvents.at(-1).output.resolved.source, 'omr');


