import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUILDER_BLOCK_NAMES } from '../packages/ai-planner/dist/builder/index.js';
import { planBuilding } from '../packages/ai-planner/dist/index.js';

const packRoot = resolve('frontend/public/lodestone-default-pack');
const { blockstates, models, textures } = JSON.parse(readFileSync(resolve(packRoot, 'assets.json'), 'utf8'));
const atlas = readFileSync(resolve(packRoot, 'atlas.png'));
if (atlas.toString('ascii', 1, 4) !== 'PNG') throw new Error('atlas.png is not a PNG file');
const atlasWidth = atlas.readUInt32BE(16);
const atlasHeight = atlas.readUInt32BE(20);

// `grass` was renamed to `short_grass` in 1.20.3; the pack has no `grass` blockstate.
const ALIASES = { grass: 'short_grass' };
const failures = [];
const failedBlocks = new Set();

function stripNamespace(id) {
  return String(id).replace(/^minecraft:/, '');
}

function blockStateCandidates(id) {
  const raw = String(id);
  const name = stripNamespace(raw);
  const candidates = [raw];
  if (ALIASES[raw]) candidates.push(ALIASES[raw]);
  if (name !== raw) candidates.push(name);
  if (ALIASES[name]) candidates.push(ALIASES[name]);
  return [...new Set(candidates)];
}

function resolveBlockState(id) {
  for (const candidate of blockStateCandidates(id)) if (blockstates[candidate]) return candidate;
  return null;
}

function modelCandidates(id) {
  const name = stripNamespace(id);
  return name.startsWith('block/') ? [name, name.slice('block/'.length)] : [`block/${name}`, name];
}

function resolveModel(id) {
  for (const candidate of modelCandidates(id)) if (models[candidate]) return candidate;
  return null;
}

function fail(blockId, message) {
  failures.push(`${blockId}: ${message}`);
  failedBlocks.add(blockId);
}

function modelEntries(state) {
  const entries = [];
  for (const value of Object.values(state.variants ?? {})) {
    entries.push(...(Array.isArray(value) ? value : [value]));
  }
  for (const part of state.multipart ?? []) {
    const apply = part?.apply ?? part;
    entries.push(...(Array.isArray(apply) ? apply : [apply]));
  }
  return entries.filter((entry) => entry && typeof entry === 'object' && entry.model);
}

function flattenModel(key, textureMap = {}, seen = new Set(), issues = []) {
  if (seen.has(key)) {
    issues.push(`cyclic parent chain at ${key}`);
    return { textureMap, issues };
  }
  seen.add(key);
  const model = models[key];
  if (!model) {
    issues.push(`model missing: ${key}`);
    return { textureMap, issues };
  }
  if (model.parent) {
    const parent = resolveModel(model.parent);
    if (parent) flattenModel(parent, textureMap, seen, issues);
    else issues.push(`parent missing: ${stripNamespace(model.parent)} (from ${key})`);
  }
  for (const [variable, value] of Object.entries(model.textures ?? {})) textureMap[variable] = value;
  return { textureMap, issues };
}

function modelChain(key) {
  const chain = [];
  let cursor = key;
  const walked = new Set();
  while (cursor && !walked.has(cursor)) {
    walked.add(cursor);
    chain.push(cursor);
    const parent = models[cursor]?.parent;
    cursor = parent ? resolveModel(parent) : null;
  }
  return chain;
}

function dereference(ref, textureMap) {
  let value = ref;
  const seen = new Set();
  while (typeof value === 'string' && value.startsWith('#')) {
    const variable = value.slice(1);
    if (seen.has(variable)) return null;
    seen.add(variable);
    value = textureMap[variable];
  }
  return typeof value === 'string' ? value : null;
}

function textureKey(id) {
  const name = stripNamespace(id);
  if (textures[name]) return name;
  if (!name.includes('/') && textures[`block/${name}`]) return `block/${name}`;
  return null;
}

function checkAtlas(textureId, blockId, modelKey) {
  const rect = textures[textureId];
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) {
    fail(blockId, `${modelKey} texture ${textureId}: invalid atlas rectangle ${JSON.stringify(rect)}`);
    return;
  }
  const [x, y, width, height] = rect;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > atlasWidth || y + height > atlasHeight) {
    fail(blockId, `${modelKey} texture ${textureId}: atlas rectangle ${JSON.stringify(rect)} outside ${atlasWidth}x${atlasHeight}`);
  }
}

function checkBlock(blockId) {
  const stateKey = resolveBlockState(blockId);
  if (!stateKey) {
    fail(blockId, `no blockstate (tried ${blockStateCandidates(blockId).join(', ')})`);
    return;
  }
  const entries = modelEntries(blockstates[stateKey]);
  if (!entries.length) {
    fail(blockId, `blockstate ${stateKey} references no models`);
    return;
  }

  const checkedFaces = new Set();
  for (const entry of entries) {
    const modelKey = resolveModel(entry.model);
    if (!modelKey) {
      fail(blockId, `model missing: ${stripNamespace(entry.model)}`);
      continue;
    }
    const { textureMap, issues } = flattenModel(modelKey);
    for (const issue of issues) fail(blockId, `${modelKey} ${issue}`);

    for (const chainKey of modelChain(modelKey)) {
      for (const element of models[chainKey]?.elements ?? []) {
        for (const [face, data] of Object.entries(element.faces ?? {})) {
          const ref = data?.texture;
          if (typeof ref !== 'string') continue;
          const faceKey = `${chainKey}|${face}|${ref}`;
          if (checkedFaces.has(faceKey)) continue;
          checkedFaces.add(faceKey);

          const value = ref.startsWith('#') ? dereference(ref, textureMap) : ref;
          if (typeof value !== 'string') {
            fail(blockId, `${chainKey} face=${face}: unresolved ${ref}`);
            continue;
          }
          const key = textureKey(value);
          if (!key) {
            fail(blockId, `${chainKey} face=${face}: missing texture ${stripNamespace(value)}`);
            continue;
          }
          checkAtlas(key, blockId, chainKey);
        }
      }
    }
  }
}

const catalogTotal = BUILDER_BLOCK_NAMES.length;
const catalogFailed = [];
const catalogIds = new Set(BUILDER_BLOCK_NAMES.map(stripNamespace));
for (const id of BUILDER_BLOCK_NAMES) {
  checkBlock(id);
  if (failedBlocks.has(id)) catalogFailed.push(id);
}
const catalogMissing = catalogFailed;
const catalogResolved = catalogTotal - catalogMissing.length;

const PLAN_PROMPTS = ['small stone house', 'a gothic tower', 'a stone bridge over a river', 'a cave'];
const paletteMissing = [];
const paletteCheckedIds = new Set();
for (const prompt of PLAN_PROMPTS) {
  const plan = planBuilding({ prompt, seed: 7 });
  const palette = plan?.palette ?? {};
  for (const value of Object.values(palette)) {
    if (typeof value !== 'string') continue;
    const id = stripNamespace(value);
    if (paletteCheckedIds.has(id)) continue;
    paletteCheckedIds.add(id);
    const before = failures.length;
    if (!catalogIds.has(id)) checkBlock(id);
    if (!resolveBlockState(id) && failures.length === before) fail(`palette(${prompt})`, `no blockstate for ${id}`);
    if (!resolveBlockState(id) || failedBlocks.has(id)) paletteMissing.push(id);
  }
}

const summary = {
  catalogTotal,
  catalogResolved,
  catalogMissing,
  paletteChecked: paletteCheckedIds.size,
  paletteMissing,
  failures: failures.slice(0, 40),
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.error(`${failures.length} texture regression failure(s) across ${failedBlocks.size} block(s).`);
  process.exitCode = 1;
}
