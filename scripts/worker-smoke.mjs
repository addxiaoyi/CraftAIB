import assert from 'node:assert/strict';
import { createGrid } from '../packages/core/dist/index.js';
import { createCoreRunner, createTaskRegistry } from '../packages/engine-worker/dist/index.js';

const events = [];
const registry = createTaskRegistry((event) => events.push(event), createCoreRunner());
const grid = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'minecraft:stone' } }], { width: 1, height: 1, length: 1 });
await registry.run({ id: 'schem', type: 'schematic.serialize', input: grid });
const result = events.find((event) => event.taskId === 'schem' && event.type === 'result');
assert.equal(result.output[0], 0x1f); assert.equal(result.output[1], 0x8b);
console.log('worker export task tests passed');
