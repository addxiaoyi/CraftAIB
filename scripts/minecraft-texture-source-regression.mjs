import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { blockTextureName } from '../frontend/src/integrations/bundledTextures.ts';
import { BUILDER_BLOCK_NAMES } from '../packages/ai-planner/dist/builder/index.js';
import { pickVoxel } from '../frontend/src/integrations/voxelPicking.ts';

const assets = JSON.parse(await readFile('frontend/public/lodestone-default-pack/assets.json', 'utf8'));
const failures = [];
for (const block of BUILDER_BLOCK_NAMES) {
  if (['air', 'cave_air', 'void_air'].includes(block.replace(/^minecraft:/, ''))) continue;
  const texture = blockTextureName(assets, block);
  if (!texture || !assets.textures[texture]) failures.push(block);
}
assert.deepEqual(failures, [], 'All Builder blocks must resolve to a bundled texture without a CDN.');
assert.equal(blockTextureName(assets, 'minecraft:stone'), 'block/stone');
assert.equal(blockTextureName(assets, 'minecraft:oak_stairs'), 'block/oak_planks');
assert.equal(blockTextureName(assets, 'missing:stone'), null, 'Unknown namespaces must not silently use vanilla stone.');
assert.equal(blockTextureName(assets, 'minecraft:unknown_block'), null);
const occupied = new Set(['0,0,0', '2,0,0']);
const camera = { position: [1.5, 0.5, 4], target: [1.5, 0.5, 0], fov: 90 };
assert.deepEqual(pickVoxel(occupied, camera, 37.5, 50, 100, 100, 4), { pos: [0, 0, 0], normal: [0, 0, 1] });
assert.deepEqual(pickVoxel(occupied, camera, 62.5, 50, 100, 100, 4), { pos: [2, 0, 0], normal: [0, 0, 1] });
assert.equal(pickVoxel(occupied, camera, 50, 50, 100, 100, 4), null);
assert.deepEqual(pickVoxel(new Set(['0,0,0']), { position: [0.5, 4, 0.5], target: [0.5, 0, 0.5], fov: 70 }, 50, 50, 100, 100, 4), { pos: [0, 0, 0], normal: [0, 1, 0] });
console.log(JSON.stringify({ source: 'bundled atlas', builderBlocks: BUILDER_BLOCK_NAMES.length, networkRequired: false, failures }));
