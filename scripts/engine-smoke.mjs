import assert from 'node:assert/strict';
import { analyzeReferencePixels, planBuilding, planBuildingFromReference, planBuildingWithModel, structurePlanToGrid } from '../packages/ai-planner/dist/index.js';
import { analyzeMaterials, mergeGrids, applyGridEdit, countMaterials, createGrid, createProject, parseProject, serializeProject, gridToScene, validateGrid } from '../packages/core/dist/index.js';
import { fromVoxelartcraft } from '../packages/voxelartcraft-adapter/dist/index.js';
import { fromCartographerCells, generateLitematicaSchema, generateMapArt, serializeLitematica } from '../packages/cartographer-adapter/dist/index.js';
import { fromCraftmaticSchematic, generateBrowserStructure, gridToViewerData, viewerDataToGrid, parseLitematicaBytes, parseSchematicBytes, serializeSchematic, toCraftmaticSchematic } from '../packages/craftmatic-adapter/dist/index.js';

const grid = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'stone' } }], { width: 1, height: 1, length: 1 });
const towerPlan = planBuilding({ prompt: 'a gothic tower', seed: 5 });
const towerGrid = structurePlanToGrid(towerPlan);
const towerBlocks = new Map(towerGrid.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.block]));
const towerWidth = towerPlan.dimensions.width;
const towerHeight = towerPlan.dimensions.height;
const towerLength = towerPlan.dimensions.length;
assert.ok(towerPlan.geometry.parts.length > 10, 'a tower should carry typed geometry');
assert.equal(towerBlocks.get('7,1,0').id, 'minecraft:dark_oak_door');
assert.equal(towerBlocks.get('7,1,0').properties.half, 'lower');
assert.equal(towerBlocks.get('7,2,0').properties.half, 'upper');
assert.equal(towerBlocks.get('7,1,0').properties.facing, 'south');
assert.ok(towerGrid.cells.some((cell) => cell.block.id === 'minecraft:stone_brick_stairs'), 'tower should contain a stairs flight');
assert.ok(towerGrid.cells.some((cell) => cell.block.id === towerPlan.palette.window), 'tower should open windows');
assert.equal(towerGrid.cells.filter((cell) => cell.y === towerHeight - 2 && cell.block.id === towerPlan.palette.roof).length, towerWidth * towerLength, 'deck should be one solid course under the crown');
assert.ok(towerGrid.cells.filter((cell) => cell.y === towerHeight - 1 && cell.block.id === towerPlan.palette.roof).length < towerWidth * towerLength / 2, 'crown should be a merlon ring, not a solid cap');
assert.ok(towerGrid.cells.some((cell) => cell.y === 3 && cell.x === 0 && cell.block.id === towerPlan.palette.wall), 'tower wall should not have the old periodic full-floor gap');
const previewHouse = planBuilding({ prompt: 'small stone house', seed: 7 });
const previewRoof = structurePlanToGrid(previewHouse).cells.filter((cell) => cell.block.id === previewHouse.palette.roof);
const roofCourses = [...new Set(previewRoof.map((cell) => cell.y))].sort((a, b) => a - b).map((y) => previewRoof.filter((cell) => cell.y === y).length);
assert.ok(roofCourses.length >= 2 && roofCourses.every((count, index) => index === 0 || count <= roofCourses[index - 1]), 'a gable roof must narrow course by course toward the ridge');
const massedPlan = planBuilding({ prompt: 'a hall width 64', seed: 8 });
assert.ok(massedPlan.dimensions.length > massedPlan.dimensions.width, 'a large brief without constraints should take its footprint from the type proportions');
const housePlan = planBuilding({ prompt: 'a small house with a gabled roof', seed: 6 });
housePlan.dimensions = { width: 11, height: 12, length: 9 };
housePlan.floors = 2;
housePlan.regions = [
  { name: 'main house', role: 'main structure', x: 0, y: 0, z: 0, width: 11, height: 8, length: 9 },
  { name: 'roof', role: 'gable roof', x: 0, y: 8, z: 0, width: 11, height: 4, length: 9 },
];
housePlan.rooms = [{ id: 'hall', type: 'hall', floor: 0, x: 1, y: 1, z: 1, width: 9, height: 3, length: 7 }];
housePlan.components = [
  { id: 'door', type: 'door', x: 5, y: 1, z: 0, options: { facing: 'south' } },
  { id: 'roof', type: 'gable', x: 0, y: 8, z: 0, options: { overhang: 1 } },
];
housePlan.geometry = undefined;
const houseGrid = structurePlanToGrid(housePlan);
assert.ok(houseGrid.cells.some((cell) => cell.y === 8 && cell.block.id === housePlan.palette.roof), 'gable roof should begin at eaves height');
assert.ok(houseGrid.cells.some((cell) => cell.y === 11 && cell.block.id === housePlan.palette.roof), 'gable roof should rise to a ridge');
assert.ok(houseGrid.cells.filter((cell) => cell.y === 11).length < housePlan.dimensions.width * housePlan.dimensions.length / 2, 'gable roof should not be a flat full-volume cap');
assert.ok(houseGrid.cells.some((cell) => cell.block.id === 'minecraft:dark_oak_door'), 'legacy raster should still place the entrance door');
const referencePixels = new Uint8Array(16 * 16 * 4);
for (let y = 2; y < 14; y += 1) {
  const left = y < 5 ? 5 : 3;
  const right = y < 5 ? 10 : 12;
  for (let x = left; x <= right; x += 1) {
    const offset = (y * 16 + x) * 4;
    referencePixels[offset] = 150;
    referencePixels[offset + 1] = 80;
    referencePixels[offset + 2] = 40;
    referencePixels[offset + 3] = 255;
  }
}
const referenceFeatures = analyzeReferencePixels({ width: 16, height: 16, pixels: referencePixels });
assert.ok(referenceFeatures.silhouette.some((value) => value > 0.2), 'reference analysis should capture a non-rectangular silhouette');
const referencePlan = planBuildingFromReference({ prompt: 'reconstruct this reference', seed: 7, referenceImage: { width: 16, height: 16, pixels: referencePixels } });
const referenceGrid = structurePlanToGrid(referencePlan);
assert.ok(referencePlan.referenceFeatures, 'reference features must remain in the StructurePlan');
assert.ok(referenceGrid.cells.some((cell) => cell.block.id === referencePlan.palette.window), 'reference facade should retain window openings');
assert.ok(new Set(referenceGrid.cells.filter((cell) => cell.block.id === referencePlan.palette.wall).map((cell) => cell.y)).size > 3, 'reference facade should produce continuous vertical geometry');
assert.equal(grid.palette[1].id, 'minecraft:stone'); assert.equal(countMaterials(grid).get('minecraft:stone'), 1); const gaps = analyzeMaterials(grid, { 'minecraft:stone': 0 }, { 'minecraft:stone': ['minecraft:cobblestone'] }); assert.equal(gaps[0].missing, 1); const covered = analyzeMaterials(grid, { 'minecraft:cobblestone': 1 }, { 'minecraft:stone': ['minecraft:cobblestone'] }); assert.equal(covered[0].substituteCoverage, 1); assert.equal(covered[0].missing, 0); assert.equal(gridToScene(grid).grids.length, 1); assert.throws(() => validateGrid({ ...grid, cells: [{ ...grid.cells[0], x: 2 }] }));
const project = parseProject(serializeProject(createProject('Smoke'))); assert.equal(project.name, 'Smoke');
const edited = applyGridEdit(grid, { type: 'replace', min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, from: { id: 'minecraft:stone' }, to: { id: 'minecraft:gold_block' } }); assert.equal(edited.cells[0].block.id, 'minecraft:gold_block');
const merged = mergeGrids([grid, edited], [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]); assert.equal(merged.width, 2); assert.equal(gridToScene(grid).layers?.[0].visible ?? true, true);
const voxel = fromVoxelartcraft({ blocks: [[0, 0, 0, -2, 1, 4]], palette: [['stone', 0, 0, 0, 0]], materials: [0] }); assert.deepEqual([voxel.cells[0].x, voxel.cells[0].y, voxel.cells[0].z], [0, 0, 0]);
const map = fromCartographerCells([{ id: 'minecraft:glass', x: 0, y: 0, z: 0 }], { width: 1, height: 1 }); assert.equal(map.cells[0].source, 'cartographer');
const mapArt = generateMapArt({ width: 2, height: 2, paletteId: 'test', pixels: [{ r: 255, g: 255, b: 255, a: 255 }, { r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }, { r: 0, g: 0, b: 0, a: 255 }] }, { palette: [{ block: { id: 'minecraft:white_concrete' }, color: { r: 255, g: 255, b: 255 } }, { block: { id: 'minecraft:black_concrete' }, color: { r: 0, g: 0, b: 0 } }], dither: true, staircasing: 'baseline' }); assert.equal(mapArt.cells.length, 4);
const litematic = generateLitematicaSchema(mapArt, { name: 'Smoke Map', author: 'CraftAIB' }); assert.equal(litematic.value.Version.value, 4);
const litematicBytes = await serializeLitematica(mapArt, { name: 'Smoke Map' }); assert.equal(litematicBytes[0], 0x1f); assert.equal(litematicBytes[1], 0x8b);
const stateGrid = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'minecraft:oak_log', properties: { axis: 'x' } } }], { width: 1, height: 1, length: 1 }); const stateLitematic = await serializeLitematica(stateGrid); const parsedStateLitematic = await parseLitematicaBytes(stateLitematic); assert.equal(parsedStateLitematic.cells[0].block.properties.axis, 'x'); const parsedLitematic = await parseLitematicaBytes(litematicBytes); assert.equal(parsedLitematic.width, mapArt.width);
const schem = fromCraftmaticSchematic({ width: 1, height: 1, length: 1, palette: ['minecraft:oak_planks'], cells: [{ x: 0, y: 0, z: 0, state: 0 }] }); assert.equal(schem.cells[0].source, 'craftmatic');
const schemRoundTrip = toCraftmaticSchematic(schem); assert.equal(schemRoundTrip.palette[1], 'minecraft:oak_planks'); const browserStructure = generateBrowserStructure({ type: 'tower', style: 'modern', floors: 2, width: 12, length: 12 }); assert.ok(browserStructure.cells.length > 0); const browserStructureTypes = ['house', 'tower', 'castle', 'dungeon', 'ship', 'cathedral', 'bridge', 'windmill', 'marketplace', 'village']; for (const type of browserStructureTypes) { const generated = generateBrowserStructure({ type, style: 'fantasy', floors: 2, width: 24, length: 24 }); validateGrid(generated); assert.ok(generated.cells.length > 0, `Browser structure ${type} is empty.`); } const viewerGrid = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'minecraft:oak_log', properties: { axis: 'y' } } }, { x: 1, y: 0, z: 0, block: { id: 'minecraft:stone' } }], { width: 2, height: 1, length: 1 }); viewerGrid.origin = { x: 7, y: 8, z: 9 }; const viewerData = gridToViewerData(viewerGrid); assert.equal(viewerData.origin.x, 7); assert.equal(viewerData.palette.find((entry) => entry.state.id === 'minecraft:oak_log').state.properties.axis, 'y'); viewerData.blocks.pop(); const viewerRoundTrip = viewerDataToGrid(viewerData); assert.equal(viewerRoundTrip.cells.length, 1); assert.equal(viewerRoundTrip.cells[0].block.properties.axis, 'y'); assert.deepEqual(viewerRoundTrip.origin, { x: 7, y: 8, z: 9 });
const schemBytes = await serializeSchematic(schem); assert.equal(schemBytes[0], 0x1f); assert.equal(schemBytes[1], 0x8b);
const stateSchemBytes = await serializeSchematic(stateGrid); const parsedStateSchem = await parseSchematicBytes(stateSchemBytes); assert.equal(parsedStateSchem.cells[0].block.properties.axis, 'x'); const parsedSchem = await parseSchematicBytes(schemBytes); assert.equal(parsedSchem.width, 1); assert.equal(parsedSchem.cells[0].block.id, 'minecraft:oak_planks');
const visionPlan = { ...planBuildingWithVisionFixture(), inference: { source: 'vision-model', detectedType: 'house', detectedStyle: 'modern', confidence: 0.9 } };
assert.equal(visionPlan.regions.length > 0, true);
const visualGrid = structurePlanToGrid({ ...visionPlan, inference: { ...visionPlan.inference, source: 'vision-model' } });
assert.ok(visualGrid.cells.some((cell) => cell.block.id === 'minecraft:stone_brick_stairs'), 'visual regions should receive real Minecraft entry stairs');
assert.ok(visualGrid.cells.some((cell) => cell.block.id === 'minecraft:iron_door' || cell.block.id === visionPlan.palette.wall), 'visual regions should preserve a real block facade');
assert.equal(visualGrid.cells.filter((cell) => cell.block.id === visionPlan.palette.floor).length, 0, 'visual regions must not receive synthetic horizontal floor layers');
let plannerAttempts = 0; const retriedPlan = await planBuildingWithModel({ prompt: 'retry test' }, { endpoint: 'https://vision.test/retry', maxRetries: 2, retryDelayMs: 0, fetcher: async () => { plannerAttempts += 1; if (plannerAttempts === 1) return new Response('busy', { status: 503 }); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(planBuilding({ prompt: 'retry test' })) } }] }), { status: 200 }); } }); assert.equal(plannerAttempts, 2); assert.equal(retriedPlan.regions[0].name, 'main');
console.log('core engine adapter tests passed');
function planBuildingWithVisionFixture() { return { version: 1, name: 'vision test', type: 'house', style: 'modern', dimensions: { width: 8, height: 6, length: 8 }, floors: 1, rooms: [{ id: 'main', type: 'hall', floor: 0, x: 1, y: 1, z: 1, width: 6, height: 3, length: 6 }], regions: [{ name: 'main', role: 'main', x: 0, y: 0, z: 0, width: 8, height: 6, length: 8 }], components: [], palette: { wall: 'minecraft:quartz_block', floor: 'minecraft:smooth_stone', roof: 'minecraft:gray_concrete', window: 'minecraft:glass' }, seed: 42, notes: [] }; }
