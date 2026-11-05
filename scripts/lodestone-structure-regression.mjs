import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BlockDefinition, BlockModel } from '@mattzh72/lodestone';
import { createLodestoneProvider } from '../frontend/src/integrations/lodestoneStructure.ts';

const pack = JSON.parse(await readFile('frontend/public/lodestone-default-pack/assets.json', 'utf8'));
const ATLAS_SIZE = 2048;
const structure = {
  id: 'missing-model-states', name: 'Missing model states', author: 'regression', description: '', version: '1.20.4',
  size: { x: 8, y: 1, z: 1 }, regions: [],
  blocks: [
    { x: 0, y: 0, z: 0, blockId: 'minecraft:chain' },
    { x: 1, y: 0, z: 0, blockId: 'minecraft:lightning_rod' },
    { x: 2, y: 0, z: 0, blockId: 'minecraft:chain', state: { axis: 'x', waterlogged: 'true' } },
    { x: 3, y: 0, z: 0, blockId: 'minecraft:lightning_rod', state: { facing: 'east' } },
    { x: 4, y: 0, z: 0, blockId: 'minecraft:lightning_rod', state: { facing: 'west', powered: 'true' } },
    { x: 5, y: 0, z: 0, blockId: 'minecraft:stone' },
    { x: 6, y: 0, z: 0, blockId: 'chain' },
    { x: 7, y: 0, z: 0, blockId: 'minecraft:grass' },
  ],
};
const original = structuredClone(structure);
const provider = createLodestoneProvider(structure);
const models = new Map();
const modelProvider = {
  getBlockModel(id) {
    const key = id.path;
    if (!models.has(key)) {
      const json = pack.models[key];
      assert.ok(json, `Bundled model must exist: ${key}`);
      models.set(key, BlockModel.fromJson(json));
      models.get(key).flatten(modelProvider);
    }
    return models.get(key);
  },
};
const atlas = { getTextureUV: (id) => {
  const rect = pack.textures[id.path];
  assert.ok(rect, `Bundled texture must exist: ${id}`);
  const [x, y, width, height] = rect;
  return [x / ATLAS_SIZE, y / ATLAS_SIZE, (x + width) / ATLAS_SIZE, (y + height) / ATLAS_SIZE];
} };
for (const block of provider.getBlocks()) {
  const id = block.state.getName();
  const definition = BlockDefinition.fromJson(pack.blockstates[id.path]);
  const mesh = definition.getMesh(id, block.state.getProperties(), atlas, modelProvider, {});
  assert.ok(!mesh.isEmpty(), `${block.state} at ${block.pos} must produce visible geometry, including missing state defaults.`);
}
assert.equal(provider.getBlock([0, 0, 0]).state.getProperty('axis'), 'y');
assert.equal(provider.getBlock([1, 0, 0]).state.getProperty('facing'), 'up');
assert.equal(provider.getBlock([1, 0, 0]).state.getProperty('powered'), 'false');
assert.equal(provider.getBlock([2, 0, 0]).state.getProperty('axis'), 'x');
assert.equal(provider.getBlock([2, 0, 0]).state.getProperty('waterlogged'), 'true');
assert.equal(provider.getBlock([3, 0, 0]).state.getProperty('facing'), 'east');
assert.equal(provider.getBlock([4, 0, 0]).state.getProperty('powered'), 'true');
assert.equal(provider.getBlock([7, 0, 0]).state.getName().toString(), 'minecraft:short_grass');
assert.equal(provider.getBlock([8, 0, 0]), null);
assert.deepEqual(provider.getSize(), [8, 1, 1]);
assert.deepEqual(structure, original, 'Preview defaults must not change the saved or exported structure.');
const modded = createLodestoneProvider({ ...structure, blocks: [{ x: 0, y: 0, z: 0, blockId: 'custom:chain' }] });
assert.deepEqual(modded.getBlock([0, 0, 0]).state.getProperties(), {});
console.log(JSON.stringify({ blocks: structure.blocks.length, nonemptyMeshes: structure.blocks.length, preservesExplicitState: true, preservesStructure: true }));
