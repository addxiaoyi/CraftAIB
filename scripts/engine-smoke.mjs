import assert from 'node:assert/strict';
import { analyzeMaterials, mergeGrids, applyGridEdit, countMaterials, createGrid, createProject, parseProject, serializeProject, gridToScene, validateGrid } from '../packages/core/dist/index.js';
import { fromVoxelartcraft } from '../packages/voxelartcraft-adapter/dist/index.js';
import { fromCartographerCells, generateLitematicaSchema, generateMapArt, serializeLitematica } from '../packages/cartographer-adapter/dist/index.js';
import { fromCraftmaticSchematic, parseLitematicaBytes, parseSchematicBytes, serializeSchematic, toCraftmaticSchematic } from '../packages/craftmatic-adapter/dist/index.js';

const grid = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'stone' } }], { width: 1, height: 1, length: 1 });
assert.equal(grid.palette[1].id, 'minecraft:stone'); assert.equal(countMaterials(grid).get('minecraft:stone'), 1); const gaps = analyzeMaterials(grid, { 'minecraft:stone': 0 }, { 'minecraft:stone': ['minecraft:cobblestone'] }); assert.equal(gaps[0].missing, 1); const covered = analyzeMaterials(grid, { 'minecraft:cobblestone': 1 }, { 'minecraft:stone': ['minecraft:cobblestone'] }); assert.equal(covered[0].substituteCoverage, 1); assert.equal(covered[0].missing, 0); assert.equal(gridToScene(grid).grids.length, 1); assert.throws(() => validateGrid({ ...grid, cells: [{ ...grid.cells[0], x: 2 }] }));
const project = parseProject(serializeProject(createProject('Smoke'))); assert.equal(project.name, 'Smoke');
const edited = applyGridEdit(grid, { type: 'replace', min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, from: { id: 'minecraft:stone' }, to: { id: 'minecraft:gold_block' } }); assert.equal(edited.cells[0].block.id, 'minecraft:gold_block');
const merged = mergeGrids([grid, edited], [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]); assert.equal(merged.width, 2); assert.equal(gridToScene(grid).layers?.[0].visible ?? true, true);
const voxel = fromVoxelartcraft({ blocks: [[0, 0, 0, -2, 1, 4]], palette: [['stone', 0, 0, 0, 0]], materials: [0] }); assert.deepEqual([voxel.cells[0].x, voxel.cells[0].y, voxel.cells[0].z], [0, 0, 0]);
const map = fromCartographerCells([{ id: 'minecraft:glass', x: 0, y: 0, z: 0 }], { width: 1, height: 1 }); assert.equal(map.cells[0].source, 'cartographer');
const mapArt = generateMapArt({ width: 2, height: 2, paletteId: 'test', pixels: [{ r: 255, g: 255, b: 255, a: 255 }, { r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }, { r: 0, g: 0, b: 0, a: 255 }] }, { palette: [{ block: { id: 'minecraft:white_concrete' }, color: { r: 255, g: 255, b: 255 } }, { block: { id: 'minecraft:black_concrete' }, color: { r: 0, g: 0, b: 0 } }], dither: true, staircasing: 'baseline' }); assert.equal(mapArt.cells.length, 4);
const litematic = generateLitematicaSchema(mapArt, { name: 'Smoke Map', author: 'CraftAIB' }); assert.equal(litematic.value.Version.value, 5);
const litematicBytes = await serializeLitematica(mapArt, { name: 'Smoke Map' }); assert.equal(litematicBytes[0], 0x1f); assert.equal(litematicBytes[1], 0x8b);
const stateGrid = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'minecraft:oak_log', properties: { axis: 'x' } } }], { width: 1, height: 1, length: 1 }); const stateLitematic = await serializeLitematica(stateGrid); const parsedStateLitematic = await parseLitematicaBytes(stateLitematic); assert.equal(parsedStateLitematic.cells[0].block.properties.axis, 'x'); const parsedLitematic = await parseLitematicaBytes(litematicBytes); assert.equal(parsedLitematic.width, mapArt.width);
const schem = fromCraftmaticSchematic({ width: 1, height: 1, length: 1, palette: ['minecraft:oak_planks'], cells: [{ x: 0, y: 0, z: 0, state: 0 }] }); assert.equal(schem.cells[0].source, 'craftmatic');
const schemRoundTrip = toCraftmaticSchematic(schem); assert.equal(schemRoundTrip.palette[1], 'minecraft:oak_planks');
const schemBytes = await serializeSchematic(schem); assert.equal(schemBytes[0], 0x1f); assert.equal(schemBytes[1], 0x8b);
const stateSchemBytes = await serializeSchematic(stateGrid); const parsedStateSchem = await parseSchematicBytes(stateSchemBytes); assert.equal(parsedStateSchem.cells[0].block.properties.axis, 'x'); const parsedSchem = await parseSchematicBytes(schemBytes); assert.equal(parsedSchem.width, 1); assert.equal(parsedSchem.cells[0].block.id, 'minecraft:oak_planks');
console.log('core engine adapter tests passed');












