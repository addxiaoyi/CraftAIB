import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as builder from '../packages/ai-planner/dist/builder/index.js';
import { loadTexturePackFromJson } from '../packages/craftmatic-adapter/dist/texture-pack.js';
import { serializeTexturedGlb } from '../packages/craftmatic-adapter/dist/glb-textured.js';
import { buildTexturedScene } from '../packages/craftmatic-adapter/dist/textured-scene.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const packDir = path.join(root, 'frontend/public/lodestone-default-pack');
const pack = loadTexturePackFromJson(path.join(packDir, 'assets.json'));
const atlasBytes = new Uint8Array(fs.readFileSync(path.join(packDir, 'atlas.png')));

const FLOAT = 5126;

function readGlb(bytes) {
  const buffer = Buffer.from(bytes);
  const jsonLength = buffer.readUInt32LE(12);
  return {
    magic: buffer.readUInt32LE(0),
    version: buffer.readUInt32LE(4),
    length: buffer.readUInt32LE(8),
    jsonLength,
    jsonKind: buffer.readUInt32LE(16),
    json: JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')),
    binLength: buffer.readUInt32LE(20 + jsonLength),
    binKind: buffer.readUInt32LE(24 + jsonLength),
    bin: buffer.subarray(28 + jsonLength, 28 + jsonLength + buffer.readUInt32LE(20 + jsonLength)),
  };
}

const catalog = builder.BUILDERGPT_BLOCK_COUNT;
assert.equal(catalog, 234, 'catalog carries the unique BuilderGPT ids');
assert.equal(builder.BUILDER_BLOCK_NAMES.length, catalog);
assert.equal(builder.BUILDER_BLOCK_COUNT, catalog);
assert.equal(builder.BUILDER_ALLOWED_BLOCKS.size, catalog);
assert.equal(builder.BUILDER_BLOCK_DIRECTORY.length, catalog);
assert.ok(builder.BUILDER_ALLOWED_BLOCKS.has('stone'));
assert.ok(!builder.BUILDER_ALLOWED_BLOCKS.has('minecraft:stone'), 'catalog stores bare ids');
assert.deepEqual(builder.builderBlockList(1).length, 1);
assert.equal(builder.builderBlockList().length, catalog);

const buildCode = [
  'function buildCreation(startX, startY, startZ) {',
  '  safeFill(startX, startY, startZ, startX + 4, startY, startZ + 4, "stone");',
  '  safeFill(startX, startY + 1, startZ, startX + 4, startY + 2, startZ, "oak_planks");',
  '  safeFill(startX, startY + 1, startZ + 4, startX + 4, startY + 2, startZ + 4, "oak_planks");',
  '  safeFill(startX, startY + 1, startZ, startX, startY + 2, startZ + 4, "oak_planks");',
  '  safeFill(startX + 4, startY + 1, startZ, startX + 4, startY + 2, startZ + 4, "oak_planks");',
  '  safeFill(startX, startY + 3, startZ, startX + 4, startY + 3, startZ + 4, "spruce_planks");',
  '  safeSetBlock(startX + 2, startY + 1, startZ, "glass_pane", "keep");',
  '  safeSetBlock(startX + 2, startY + 1, startZ, "oak_planks", "keep");',
  '  safeSetBlock(startX + 2, startY + 1, startZ + 2, "lantern");',
  '  safeFillBiome(startX, startY, startZ, startX + 4, startY + 3, startZ + 4, "plains");',
  '}',
].join('\n');

const tagged = [
  '<build_planning>hut plan</build_planning>',
  '<inspiration>A village hut</inspiration>',
  '<description>A tiny stone hut</description>',
  '<code>',
  buildCode,
  '</code>',
].join('\n');

const parsed = builder.parseBuilderSpec(tagged);
assert.equal(parsed.ok, true);
assert.equal(parsed.spec.description, 'A tiny stone hut');
assert.equal(parsed.spec.inspiration, 'A village hut');
assert.equal(parsed.spec.planning, 'hut plan');
assert.equal(parsed.spec.multiLanguage, false);
assert.ok(parsed.spec.discoveredBlocks.includes('lantern'), 'quoted catalog ids are discovered');
assert.ok(parsed.spec.discoveredBlocks.includes('lantern'), 'quoted catalog ids are discovered');
assert.ok(!parsed.spec.discoveredBlocks.includes("minecraft:stone_bricks"), 'namespaced writes are not queries');
assert.equal(parsed.spec.code, buildCode);

const run = builder.builderFromReply(tagged);
assert.equal(run.ok, true);
assert.equal(run.name, 'A tiny stone hut');
assert.equal(run.recorder.boxes, 6);
assert.equal(run.grid.width, 5);
assert.equal(run.grid.height, 4);
assert.equal(run.grid.length, 5);
assert.equal(run.recorder.biomeWrites.length, 1);
assert.equal(run.commands.length, 10);

// "keep" on an occupied cell is a no-op: the wall stays oak, the pane never lands.
const at = (x, y, z) => run.grid.cells.find((cell) => cell.x === x && cell.y === y && cell.z === z);
assert.equal(at(2, 1, 0).block.id, 'minecraft:oak_planks');
assert.ok(!run.grid.cells.some((cell) => cell.block.id === 'minecraft:glass_pane'));
assert.ok(!at(2, 1, 1), 'hollow shell leaves the interior unreachable');
assert.equal(at(2, 1, 2).block.id, 'minecraft:lantern');

// Cosmetic fields survive; planning is kept as-is.
assert.match(run.spec.planning, /hut plan/);
assert.equal(run.commands[0], 'fill 0 0 0 4 0 4 stone');

// A reply with no <code> is a normal failure, not a throw.
const missing = builder.builderFromReply('<description>nothing</description>');
assert.equal(missing.ok, false);
assert.match(missing.error, /buildCreation/);

// fenced and bare replies are accepted too.
assert.equal(builder.extractBuilderCode('```js\n' + buildCode + '\n```').trim(), buildCode);
assert.equal(builder.extractBuilderCode(buildCode), buildCode);

// The prompt mirrors the SYS_GEN contract.
const messages = builder.builderMessages({ description: 'a hut' });
assert.equal(messages.length, 2);
assert.equal(messages[0].role, 'system');
assert.match(messages[0].content, /<code>/);
assert.match(messages[0].content, /build_planning/);
assert.match(messages[0].content, /CRITICAL/);
assert.match(messages[0].content, /Do NOT use async\/await/);

// Transports are the caller's to supply; the helper only parses and runs.
const reply = await builder.builderRequest({ description: 'a hut' }, async () => ({ text: tagged }));
assert.equal(reply.ok, true);
assert.equal(reply.grid.width, 5);

// The documented object form (not just a bare mode string) is honoured.
const objectForm = builder.executeBuilderScript(
  'function buildCreation() {\n' +
  '  safeSetBlock(0, 0, 0, "stone");\n' +
  '  safeFill(-2, 0, -2, 2, 0, 2, "oak_planks", { mode: "keep" });\n' +
  '}',
);
assert.equal(objectForm.ok, true);
const objectWrites = objectForm.recorder.writes.filter((write) => write.x === 0 && write.y === 0 && write.z === 0);
assert.equal(objectWrites.length, 1, 'keep block form leaves the existing cell alone');
assert.equal(objectWrites[0].block.id, 'minecraft:stone');
assert.equal(objectForm.grid.cells.length, 25, 'the grid still spans the fill, with one hole');

// replaceFilter only overwrites cells holding the filtered block.
const filtered = builder.executeBuilderScript(
  'function buildCreation() {\n' +
  '  safeSetBlock(0, 0, 0, "stone");\n' +
  '  safeSetBlock(1, 0, 0, "grass_block");\n' +
  '  safeFill(0, 0, 0, 1, 0, 0, "dirt", { mode: "replace", replaceFilter: "minecraft:stone" });\n' +
  '}',
);
const filteredAt = (x) => filtered.grid.cells.find((cell) => cell.x === x && cell.y === 0 && cell.z === 0).block.id;
assert.equal(filteredAt(0), 'minecraft:dirt', 'matching block is replaced');
assert.equal(filteredAt(1), 'minecraft:grass_block', 'non-matching block is untouched');

// replace with no filter falls back to replacing air (upstream default).
const airReplace = builder.executeBuilderScript(
  'function buildCreation() {\n' +
  '  safeSetBlock(0, 0, 0, "stone");\n' +
  '  safeFill(0, 0, 0, 1, 0, 0, "dirt", "replace");\n' +
  '}',
);
assert.equal(airReplace.grid.cells.length, 2, 'unfiltered replace fills air only');
assert.equal(airReplace.grid.cells.find((cell) => cell.x === 0 && cell.z === 0).block.id, 'minecraft:stone');

// mode passed as an object never leaks into the command text.
assert.ok(!filtered.commands.join('\n').includes('[object Object]'), 'object options never reach command text');

// blockStates flow into both the grid and the command text; options win over inline states.
const states = builder.executeBuilderScript(
  'function buildCreation() {\n' +
  '  safeSetBlock(0, 0, 0, "oak_log", { blockStates: { axis: "x" } });\n' +
  '  safeSetBlock(1, 0, 0, "stone");\n' +
  '  safeFill(2, 0, 0, 3, 0, 0, "oak_log[axis=y]", { blockStates: { axis: "z" } });\n' +
  '}',
);
const statesAt = (x) => states.grid.cells.find((cell) => cell.x === x && cell.y === 0 && cell.z === 0);
assert.equal(statesAt(0).block.id, 'minecraft:oak_log');
assert.deepEqual(statesAt(0).block.properties, { axis: 'x' }, 'options.blockStates land in the grid');
assert.equal(statesAt(1).block.id, 'minecraft:stone');
assert.ok(!statesAt(1).block.properties, 'plain blocks stay bare');
assert.deepEqual(statesAt(2).block.properties, { axis: 'z' }, 'options.blockStates beat inline states');
assert.equal(states.commands[0], 'setblock 0 0 0 oak_log[axis=x]', 'states appear in command text with bare ids');
assert.equal(states.commands[1], 'setblock 1 0 0 stone');
assert.equal(states.commands[2], 'fill 2 0 0 3 0 0 oak_log[axis=z]');

// Analysis: the numbers the preview pipeline needs before it can skin a build.
const stats = builder.analyzeBuild(run.grid);
assert.equal(stats.width, 5);
assert.equal(stats.height, 4);
assert.equal(stats.length, 5);
assert.equal(stats.cells, run.grid.cells.length);
assert.equal(stats.palette.length, 4, 'stone, oak_planks, spruce_planks, lantern');
assert.equal(stats.materials[0].count, Math.max(...stats.materials.map((entry) => entry.count)));
assert.ok(stats.fill > 0 && stats.fill < 1);
assert.ok(stats.shell > 0);
assert.ok(stats.exposedFaces > 0, 'a hollow hut still has faces to draw');
assert.equal(stats.interior, 0, 'a hollow hut buries nothing');

// A solid cube buries its centre: only the shell is visible.
const solid = builder.executeBuilderScript(
  'function buildCreation() { safeFill(0, 0, 0, 2, 2, 2, "stone"); }',
);
const solidStats = builder.analyzeBuild(solid.grid);
assert.equal(solidStats.cells, 27);
assert.equal(solidStats.shell, 26);
assert.equal(solidStats.interior, 1);
assert.equal(solidStats.exposedFaces, 54, '6 faces per surface cell of a 3x3x3 cube');
const solidGlb = serializeTexturedGlb(solid.grid, pack, { atlas: atlasBytes });
const solidScene = buildTexturedScene(solid.grid, pack);
const solidGltf = readGlb(solidGlb);
const solidPrimitive = solidGltf.json.meshes[0].primitives[0];
const indexAccessor = solidGltf.json.accessors[solidPrimitive.indices];
const positionAccessor = solidGltf.json.accessors[solidPrimitive.attributes.POSITION];
const indexView = solidGltf.json.bufferViews[indexAccessor.bufferView];
const indexStart = (indexView.byteOffset ?? 0) + (indexAccessor.byteOffset ?? 0);
const indexBytes = solidGltf.bin.subarray(indexStart, indexStart + indexAccessor.count * 4);
assert.equal(indexAccessor.componentType, 5125, 'index accessor is unsigned int');
assert.equal(indexAccessor.count, solidStats.exposedFaces * 24, '6 triangles x 4 corners at 216 exposed faces');
assert.equal(positionAccessor.count, solidStats.exposedFaces * 16, 'each of the 216 faces keeps its own 16 vertices');
assert.equal(solidGltf.magic, 0x46546c67, 'glTF magic');
assert.equal(solidGltf.version, 2);
assert.equal(solidGltf.length, solidGlb.length, 'header length covers the whole file');
assert.equal(solidGltf.jsonKind, 0x4e4f534a, 'JSON chunk kind');
assert.equal(solidGltf.binKind, 0x004e4942, 'BIN chunk kind');
assert.equal(solidGltf.jsonLength % 4, 0, 'JSON chunk is 4-byte aligned');
assert.equal(solidGltf.binLength % 4, 0, 'BIN chunk is 4-byte aligned');
assert.ok(solidGltf.binLength - solidGltf.json.buffers[0].byteLength < 4, 'only alignment padding spills past the buffer');
assert.ok(indexBytes.every((value, at) => (at & 3) !== 3 || value === 0), 'indices are little-endian uint32');

// The atlas rides along as a PNG buffer view; samplers stay NEAREST/CLAMP so voxels do not blur.
const solidJson = solidGltf.json;
assert.equal(solidPrimitive.material, 1, 'atlas material is bound');
assert.equal(solidJson.images.length, 1);
assert.equal(solidJson.images[0].mimeType, 'image/png');
assert.equal(solidJson.textures.length, 1);
assert.equal(solidJson.textures[0].source, 0);
assert.equal(solidJson.textures[0].sampler, 0);
assert.equal(solidJson.samplers.length, 1);
assert.equal(solidJson.samplers[0].magFilter, 9728);
assert.equal(solidJson.samplers[0].minFilter, 9728);
assert.equal(solidJson.samplers[0].wrapS, 33071);
assert.equal(solidJson.samplers[0].wrapT, 33071);
assert.equal(solidJson.materials[solidPrimitive.material].pbrMetallicRoughness.baseColorTexture.index, 0);
assert.equal(solidJson.materials[solidPrimitive.material].alphaMode, 'MASK');
const imageView = solidJson.bufferViews[solidJson.images[0].bufferView];
assert.deepEqual([...solidGltf.bin.subarray(imageView.byteOffset, imageView.byteOffset + 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'atlas PNG signature');
assert.equal(imageView.byteLength, atlasBytes.byteLength, 'atlas embedded at full size');

// UVs land inside the unit square after the glTF top-left flip.
const coordAccessor = solidJson.accessors[solidPrimitive.attributes.TEXCOORD_0];
assert.equal(coordAccessor.type, 'VEC2');
assert.equal(coordAccessor.componentType, FLOAT);
const coordView = solidJson.bufferViews[coordAccessor.bufferView];
const coordStart = (coordView.byteOffset ?? 0) + (coordAccessor.byteOffset ?? 0);
for (let at = 0; at < coordAccessor.count * 2; at += 1) {
  const value = solidGltf.bin.readFloatLE(coordStart + at * 4);
  assert.ok(value >= 0 && value <= 1, 'TEXCOORD_0 stays in [0, 1]');
}

// No atlas: the build still exports, as untextured solid material 0.
const plainGltf = readGlb(serializeTexturedGlb(solid.grid, pack));
assert.equal(plainGltf.json.meshes[0].primitives[0].material, 0);
assert.ok(!plainGltf.json.images && !plainGltf.json.textures && !plainGltf.json.samplers);
assert.equal(plainGltf.json.accessors[plainGltf.json.meshes[0].primitives[0].attributes.POSITION].count, solidStats.exposedFaces * 16);


// Transparent blocks must not cull their neighbours. The pack lists them as namespaced ids,
// the lookup uses the shared compact id, so `minecraft:white_stained_glass` has to resolve.
const beside = (id) => buildTexturedScene({
  version: 1, width: 3, height: 3, length: 3, coordinateSystem: 'xyz', origin: { x: 0, y: 0, z: 0 },
  palette: [{ id: 'minecraft:air' }, { id: 'minecraft:stone' }, { id: 'minecraft:white_stained_glass' }],
  cells: [
    { x: 0, y: 0, z: 0, block: { id: 'minecraft:stone' }, source: 'user' },
    { x: 1, y: 0, z: 0, block: { id }, source: 'user' },
  ],
}, pack).faces.length;
assert.equal(beside('minecraft:stone'), 40, 'a plain stone block keeps all 24 quads, and the neighbour hides its touching face');
assert.equal(beside('minecraft:white_stained_glass'), 29, 'a transparent neighbour neither culls nor is culled');
const lanternBuild = builder.executeBuilderScript(
  'function buildCreation() { safeSetBlock(0, 0, 0, "lantern"); }',
);
const lanternGltf = readGlb(serializeTexturedGlb(lanternBuild.grid, pack));
const lanternTint = lanternGltf.json.accessors[lanternGltf.json.meshes[0].primitives[0].attributes._EMISSIVE];
const lanternView = lanternGltf.json.bufferViews[lanternTint.bufferView];
const lanternStart = (lanternView.byteOffset ?? 0) + (lanternTint.byteOffset ?? 0);
assert.ok(Number(pack.flags.emissive.get('lantern')) > 0, 'pack marks lantern emissive');
for (let at = 0; at < lanternTint.count; at += 1) {
  assert.equal(lanternGltf.bin.readFloatLE(lanternStart + at * 4), Math.fround(Number(pack.flags.emissive.get('lantern'))), '_EMISSIVE matches the pack flag');
}
const solidTint = solidJson.accessors[solidPrimitive.attributes._EMISSIVE];
const solidTintView = solidJson.bufferViews[solidTint.bufferView];
const solidTintStart = (solidTintView.byteOffset ?? 0) + (solidTint.byteOffset ?? 0);
for (let at = 0; at < solidTint.count; at += 1) assert.equal(solidGltf.bin.readFloatLE(solidTintStart + at * 4), 0, 'stone is not emissive');

console.log('builder smoke ok');
