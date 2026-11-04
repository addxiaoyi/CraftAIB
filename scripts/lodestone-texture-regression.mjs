import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

const packRoot = resolve('frontend/public/lodestone-default-pack');
const assets = JSON.parse(await readFile(resolve(packRoot, 'assets.json'), 'utf8'));
const atlas = PNG.sync.read(await readFile(resolve(packRoot, 'atlas.png')));
const textures = assets.textures ?? {};
const models = assets.models ?? {};
const blockstates = assets.blockstates ?? {};
const failures = [];

function modelId(value) {
  return String(value).replace(/^minecraft:/, '').replace(/^block\//, 'block/');
}
function flattenModel(id, seen = new Set()) {
  const key = modelId(id);
  if (seen.has(key)) return {};
  seen.add(key);
  const model = models[key] ?? models[key.replace(/^block\//, '')];
  if (!model) return {};
  const parent = model.parent ? flattenModel(model.parent, seen) : {};
  return { ...parent, ...(model.textures ?? {}) };
}
function checkModel(id) {
  const key = modelId(id);
  const model = models[key] ?? models[key.replace(/^block\//, '')];
  if (!model) {
    failures.push(`${key}: model missing`);
    return;
  }
  const refs = flattenModel(key);
  const faces = Object.values(model.elements ?? {}).flatMap((element) => Object.entries(element.faces ?? {}));
  for (const [face, data] of faces) {
    const ref = data?.texture;
    if (typeof ref !== 'string') continue;
    if (!ref.startsWith('#')) {
      failures.push(`${key} face=${face}: bare texture variable ${JSON.stringify(ref)} (expected #${ref})`);
      continue;
    }
    const texture = refs[ref.slice(1)];
    if (typeof texture !== 'string') {
      failures.push(`${key} face=${face}: unresolved ${ref}`);
      continue;
    }
    const textureKey = texture.replace(/^minecraft:/, '');
    if (!textures[textureKey]) failures.push(`${key} face=${face}: missing texture ${textureKey}`);
  }
}
for (const state of Object.values(blockstates)) {
  const variants = state.variants ? Object.values(state.variants) : [];
  const multipart = state.multipart ?? [];
  for (const entry of [...variants, ...multipart]) {
    const candidates = Array.isArray(entry) ? entry : [entry];
    for (const candidate of candidates) if (candidate?.model) checkModel(candidate.model);
  }
}
for (const [key, rect] of Object.entries(textures)) {
  if (!Array.isArray(rect) || rect.length !== 4) failures.push(`${key}: invalid texture rectangle`);
  else {
    const [x, y, width, height] = rect;
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 2048 || y + height > 2048) failures.push(`${key}: atlas rectangle out of bounds ${JSON.stringify(rect)}`);
  }
}
assert.equal(atlas.width, 2048, `atlas width must be 2048, got ${atlas.width}`);
assert.equal(atlas.height, 1248, `atlas height must be 1248, got ${atlas.height}`);
if (failures.length) {
  console.error(JSON.stringify({ failures: failures.slice(0, 40), failureCount: failures.length }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ blockstates: Object.keys(blockstates).length, models: Object.keys(models).length, textures: Object.keys(textures).length, atlas: [atlas.width, atlas.height], failures: [] }, null, 2));
}
