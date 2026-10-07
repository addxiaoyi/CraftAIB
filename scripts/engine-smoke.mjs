import assert from 'node:assert/strict';
import { countMaterials, createGrid, createProject, parseProject, serializeProject, gridToScene, validateGrid } from '../packages/core/dist/index.js';
import { fromVoxelartcraft } from '../packages/voxelartcraft-adapter/dist/index.js';
import { fromCartographerCells } from '../packages/cartographer-adapter/dist/index.js';
import { fromCraftmaticSchematic } from '../packages/craftmatic-adapter/dist/index.js';

const grid = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'stone' } }], { width: 1, height: 1, length: 1 });
assert.equal(grid.palette[1].id, 'minecraft:stone'); assert.equal(countMaterials(grid).get('minecraft:stone'), 1); assert.equal(gridToScene(grid).grids.length, 1); assert.throws(() => validateGrid({ ...grid, cells: [{ ...grid.cells[0], x: 2 }] }));
const project = parseProject(serializeProject(createProject('Smoke'))); assert.equal(project.name, 'Smoke');
const voxel = fromVoxelartcraft({ blocks: [[0, 0, 0, -2, 1, 4]], palette: [['stone', 0, 0, 0, 0]], materials: [0] }); assert.deepEqual([voxel.cells[0].x, voxel.cells[0].y, voxel.cells[0].z], [0, 0, 0]);
const map = fromCartographerCells([{ id: 'minecraft:glass', x: 0, y: 0, z: 0 }], { width: 1, height: 1 }); assert.equal(map.cells[0].source, 'cartographer');
const schem = fromCraftmaticSchematic({ width: 1, height: 1, length: 1, palette: ['minecraft:oak_planks'], cells: [{ x: 0, y: 0, z: 0, state: 0 }] }); assert.equal(schem.cells[0].source, 'craftmatic');
console.log('core engine adapter tests passed');
