import assert from 'node:assert/strict';
import { generateWaxMapArt } from '../packages/waxmapart-adapter/dist/index.js';
import { validateGrid } from '../packages/core/dist/index.js';

const palette = [
  { block: { id: 'minecraft:white_wool', properties: { color: 'white' } }, color: { r: 255, g: 255, b: 255 }, colorId: 8 },
  { block: { id: 'minecraft:red_wool' }, color: { r: 189, g: 48, b: 49 }, colorId: 52, needSupport: true },
];
const pixels = [
  { r: 255, g: 255, b: 255, a: 255 }, { r: 180, g: 20, b: 20, a: 255 },
  { r: 80, g: 80, b: 80, a: 255 }, { r: 0, g: 0, b: 0, a: 255 },
];
const image = { width: 2, height: 2, pixels, paletteId: 'wax-smoke' };

const flat = generateWaxMapArt(image, { palette, mode: 'flat', dithering: 'none', comparison: 'cie76', supportBlock: { id: 'minecraft:stone' } });
validateGrid(flat);
assert.equal(flat.width, 2);
assert.equal(flat.length, 3);
assert.equal(flat.cells.some((cell) => cell.block.properties?.color === 'white'), true, 'palette block properties should survive conversion');
assert.equal(flat.metadata?.mapArt.engine, 'waxmapart');
assert.equal(flat.metadata?.mapArt.materials.length >= 2, true);

for (const comparison of ['rgb', 'cie76', 'cie94', 'cie2000', 'cmc', 'delta-e-itp']) {
  for (const dithering of ['none', 'floyd-steinberg', 'atkinson', 'jarvis-judice-ninke']) {
    const grid = generateWaxMapArt(image, { palette, mode: 'staircase', comparison, dithering, supportBlock: { id: 'minecraft:stone' } });
    validateGrid(grid);
    assert.equal(grid.metadata?.mapArt.comparison, comparison);
    assert.equal(grid.metadata?.mapArt.dithering, dithering);
    assert.ok(grid.cells.some((cell) => cell.block.id === 'minecraft:stone'), 'support block is included');
    assert.ok(grid.cells.some((cell) => cell.block.id === 'minecraft:red_wool'), 'material block is included');
  }
}

assert.throws(() => generateWaxMapArt({ ...image, pixels: pixels.slice(0, 1) }, { palette, mode: 'flat' }), /pixel count/i);
assert.throws(() => generateWaxMapArt(image, { palette: [], mode: 'flat' }), /palette/i);
console.log('waxmapart smoke passed');
