import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

const packRoot = resolve('frontend/public/lodestone-default-pack');
const { textures, models, blockstates } = JSON.parse(await readFile(resolve(packRoot, 'assets.json'), 'utf8'));
const atlas = PNG.sync.read(await readFile(resolve(packRoot, 'atlas.png')));
const failures = new Set();
const flattened = new Map();
const checked = new Set();
const keyOf = (id) => String(id).replace(/^minecraft:/, '');

function flatten(id, parents = new Set()) {
  const key = keyOf(id);
  if (flattened.has(key)) return flattened.get(key);
  if (parents.has(key)) throw new Error(`cyclic model parent: ${key}`);
  const model = models[key];
  if (!model) throw new Error(`missing model: ${key}`);
  const parent = model.parent ? flatten(model.parent, new Set([...parents, key])) : {};
  const merged = { ...parent, ...model, textures: { ...parent.textures, ...model.textures } };
  flattened.set(key, merged);
  return merged;
}

function checkModel(id) {
  const key = keyOf(id);
  if (checked.has(key)) return;
  checked.add(key);
  try {
    const model = flatten(key);
    for (const element of model.elements ?? []) {
      for (const [face, definition] of Object.entries(element.faces ?? {})) {
        let ref = definition.texture;
        const seen = new Set();
        while (typeof ref === 'string' && ref.startsWith('#')) {
          if (seen.has(ref)) throw new Error(`cyclic texture variable: ${ref}`);
          seen.add(ref);
          ref = model.textures[ref.slice(1)];
        }
        if (typeof ref !== 'string' || !textures[keyOf(ref)]) {
          throw new Error(`face=${face}: unresolved ${definition.texture} -> ${ref}`);
        }
      }
    }
  } catch (error) {
    failures.add(`${key}: ${error.message}`);
  }
}

for (const state of Object.values(blockstates)) {
  const entries = [...Object.values(state.variants ?? {}), ...(state.multipart ?? []).map((part) => part.apply)];
  for (const entry of entries) {
    for (const candidate of Array.isArray(entry) ? entry : [entry]) {
      if (candidate?.model) checkModel(candidate.model);
    }
  }
}
for (const [key, rect] of Object.entries(textures)) {
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) {
    failures.add(`${key}: invalid rectangle`);
    continue;
  }
  const [x, y, width, height] = rect;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > atlas.width || y + height > atlas.height) {
    failures.add(`${key}: rectangle ${rect} outside ${atlas.width}x${atlas.height}`);
  }
}
assert.deepEqual([...failures], [], 'All variants, multipart models and inherited faces must resolve within the actual PNG.');
console.log(JSON.stringify({ blockstates: Object.keys(blockstates).length, checkedModels: checked.size, textures: Object.keys(textures).length, atlas: [atlas.width, atlas.height], failures: [] }));
