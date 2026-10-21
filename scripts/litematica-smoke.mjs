import assert from 'node:assert/strict';
import { createGrid } from '../packages/core/dist/index.js';
import { planBuilding, structurePlanToGrid, structurePlanToRegionGrids } from '../packages/ai-planner/dist/index.js';
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

const wideCells = Array.from({ length: 257 }, (_, x) => ({ x, y: 0, z: 0, block: { id: x % 3 === 0 ? 'minecraft:stone' : x % 3 === 1 ? 'minecraft:deepslate_bricks' : 'minecraft:polished_deepslate' } }));
const wideGrid = createGrid(wideCells, { width: wideCells.length, height: 1, length: 1 });
const wideBytes = await serializeLitematica(wideGrid, { name: 'Long boundary packing' });
const wideDocument = await parseLitematicaDocumentBytes(wideBytes);
assert.equal(wideDocument.regions[0].cells.length, wideGrid.cells.length);
assert.deepEqual(wideDocument.regions[0].cells.map((cell) => `${cell.x},${cell.block.id}`), wideGrid.cells.map((cell) => `${cell.x},${cell.block.id}`));

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
const partialPlan = { ...plan, regions: [{ name: 'tower-tip', role: 'spire', x: 0, y: plan.dimensions.height - 1, z: 0, width: 1, height: 1, length: 1 }] };
const completeRegions = structurePlanToRegionGrids(partialPlan);
assert.equal(completeRegions.at(-1).name, 'Unassigned structure');
const completeGrid = structurePlanToGrid(partialPlan);
assert.equal(completeRegions.reduce((count, region) => count + region.grid.cells.length, 0), completeGrid.cells.length);
const completeBytes = await serializeLitematicaRegions(completeRegions, { name: partialPlan.name, author: 'CraftAIB' });
const completeDocument = await parseLitematicaDocumentBytes(completeBytes);
const completeCells = completeDocument.regions.flatMap((region) => region.cells.map((cell) => `${cell.x + region.position.x},${cell.y + region.position.y},${cell.z + region.position.z}`));
const expectedWorldBlocks = new Set(completeGrid.cells.map((cell) => `${cell.x},${cell.y},${cell.z},${cell.block.id},${JSON.stringify(cell.block.properties ?? {})}`));
const importedWorldBlocks = new Set(completeDocument.regions.flatMap((region) => region.cells.map((cell) => `${cell.x},${cell.y},${cell.z},${cell.block.id},${JSON.stringify(cell.block.properties ?? {})}`)));
assert.equal(importedWorldBlocks.size, completeGrid.cells.length);
assert.deepEqual(importedWorldBlocks, expectedWorldBlocks);
console.log('litematica semantic smoke passed');
