import assert from 'node:assert/strict';
import { createGrid } from '../packages/core/dist/index.js';
import { planBuilding, structurePlanToRegionGrids } from '../packages/ai-planner/dist/index.js';
import { serializeLitematica, serializeLitematicaRegions } from '../packages/cartographer-adapter/dist/index.js';
import { applyLitematicaPlacement, parseLitematicaDocumentBytes, parseLitematicaPlacements, Reader, serializeLitematicaPlacements, summarizeLitematicaDocument } from '../packages/craftmatic-adapter/dist/index.js';

const doubleList = new Uint8Array(1 + 4 + 24); const doubleView = new DataView(doubleList.buffer); doubleList[0] = 6; doubleView.setInt32(1, 3, false); doubleView.setFloat64(5, 1.25, false); doubleView.setFloat64(13, 2.5, false); doubleView.setFloat64(21, -3.75, false); assert.deepEqual(new Reader(doubleList).payload(9), { type: 6, value: [1.25, 2.5, -3.75] });

const packed = createGrid([
  { x: 0, y: 0, z: 0, block: { id: 'minecraft:stone' } },
  { x: 1, y: 0, z: 0, block: { id: 'minecraft:dirt' } },
  { x: 2, y: 0, z: 0, block: { id: 'minecraft:glass' } },
  { x: 3, y: 0, z: 0, block: { id: 'minecraft:gold_block' } },
], { width: 4, height: 1, length: 1 });
const packedBytes = await serializeLitematica(packed, { name: 'Tight packing' });
const packedDocument = await parseLitematicaDocumentBytes(packedBytes);
assert.equal(packedDocument.regions[0].cells.length, 4);
assert.deepEqual(packedDocument.regions[0].cells.map((cell) => cell.block.id), packed.cells.map((cell) => cell.block.id));
assert.deepEqual(summarizeLitematicaDocument(packedDocument).regions[0].dimensions, { x: 4, y: 1, z: 1 });

const negative = createGrid([
  { x: 0, y: 0, z: 0, block: { id: 'minecraft:stone' } },
  { x: 1, y: 0, z: 0, block: { id: 'minecraft:gold_block' } },
], { width: 2, height: 1, length: 1 });
const negativeBytes = await serializeLitematicaRegions([{ name: 'NegativeRegion', grid: negative, position: { x: 5, y: 0, z: 0 }, size: { x: -2, y: 1, z: 1 } }], { name: 'Negative region' });
const negativeDocument = await parseLitematicaDocumentBytes(negativeBytes);
assert.deepEqual(negativeDocument.regions[0].cells.map((cell) => cell.x), [4, 5]);

const placementDocument = parseLitematicaPlacements({ placements: [{ name: 'Tight packing', pos: { x: 10, y: 2, z: -4 }, rotation: 'CLOCKWISE_90' }], selected: 0 });
const placed = applyLitematicaPlacement(createGrid([{ x: 0, y: 0, z: 0, block: { id: 'minecraft:oak_log', properties: { axis: 'x' } } }], { width: 1, height: 1, length: 1 }), placementDocument.placements[0]);
assert.deepEqual(placed.origin, { x: 10, y: 2, z: -4 });
assert.equal(placed.cells[0].block.properties.axis, 'z');
assert.match(serializeLitematicaPlacements(placementDocument), /clockwise_90/);
const plan = planBuilding({ prompt: 'gothic castle 3 floors with turret and courtyard' });
const plannedRegions = structurePlanToRegionGrids(plan);
const plannedBytes = await serializeLitematicaRegions(plannedRegions, { name: plan.name, author: 'CraftAIB' });
const plannedDocument = await parseLitematicaDocumentBytes(plannedBytes);
assert.equal(plannedDocument.regions.length, 4);
const placedCells = plannedDocument.regions.flatMap((region) => region.cells.map((cell) => `${cell.x},${cell.y},${cell.z}`));
assert.equal(new Set(placedCells).size, placedCells.length);
console.log('litematica semantic smoke passed');
