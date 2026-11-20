import type { BlockState } from '@craftaib/core';

export type TextureRect = [number, number, number, number];
export type ModelFace = { texture: string; uv?: TextureRect; cullface?: string; rotation?: number; tintindex?: number };
export type ModelElement = { from: [number, number, number]; to: [number, number, number]; faces: Record<string, ModelFace> };
export type ResourceModel = { textures: Record<string, string>; elements: ModelElement[]; image?: string };
export type PackFlags = { opaque: Set<string>; transparent: Set<string>; nonSelfCulling: Set<string>; emissive: Map<string, number> };
export type TexturePack = { blockstates: Record<string, unknown>; models: Record<string, ResourceModel>; textures: Record<string, TextureRect>; atlas: { width: number; height: number }; flags: PackFlags };
export type PackFlagInput = { opaque: Iterable<string>; transparent: Iterable<string>; nonSelfCulling: Iterable<string>; emissive: Record<string, number> };
export type VariantSelection = { model: string; x: number; y: number; uvLock: boolean };

function decodeFileUrl(href: string): string {
  const path = decodeURIComponent(new URL(href).pathname);
  return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1).replace(/\//g, '\\') : path;
}

export function uniqueResourceId(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

export function legacyPackId(id: string): string {
  return id.includes(':') ? id.slice(id.lastIndexOf(':') + 1) : id;
}

export function createTexturePack(input: { blockstates: Record<string, unknown>; models: Record<string, unknown>; textures: Record<string, TextureRect>; atlasWidth: number; atlasHeight: number; flags: PackFlagInput }): TexturePack {
  const transparent = new Set<string>();
  for (const id of input.flags.transparent) transparent.add(legacyPackId(id));
  const opaque = new Set<string>();
  for (const id of input.flags.opaque) if (!transparent.has(legacyPackId(id))) opaque.add(legacyPackId(id));
  const nonSelfCulling = new Set<string>();
  for (const id of input.flags.nonSelfCulling) nonSelfCulling.add(legacyPackId(id));
  const emissive = new Map<string, number>();
  for (const [id, intensity] of Object.entries(input.flags.emissive)) emissive.set(legacyPackId(id), Number(intensity) || 0);
  return { blockstates: input.blockstates, models: input.models as Record<string, ResourceModel>, textures: input.textures, atlas: { width: input.atlasWidth, height: input.atlasHeight }, flags: { opaque, transparent, nonSelfCulling, emissive } };
}

type RawElement = { from?: unknown; to?: unknown; faces?: Record<string, { texture?: unknown; uv?: unknown; cullface?: unknown; rotation?: unknown; tintindex?: unknown }> };
type RawModelFile = { parent?: unknown; image?: unknown; textures?: Record<string, unknown>; elements?: RawElement[] };

function vec3(values: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(values) || values.length < 3) return fallback;
  const numbers = values.slice(0, 3).map((value) => Number(value));
  return numbers.every((value) => Number.isFinite(value)) ? [numbers[0], numbers[1], numbers[2]] : fallback;
}

function parseModel(data: unknown): { parent?: string; image?: string; textures: Record<string, string>; elements: ModelElement[] } {
  const raw = (data && typeof data === 'object' ? data : {}) as RawModelFile;
  const textures: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.textures ?? {})) if (typeof value === 'string') textures[key] = value;
  const elements: ModelElement[] = [];
  for (const element of Array.isArray(raw.elements) ? raw.elements : [] as RawElement[]) {
    const faces: Record<string, ModelFace> = {};
    for (const [side, face] of Object.entries(element?.faces ?? {}) as Array<[string, RawElement['faces'] & Record<string, unknown>[string]]>) {
      if (!face || typeof face.texture !== 'string') continue;
      const built: ModelFace = { texture: face.texture };
      if (Array.isArray(face.uv) && face.uv.length === 4) built.uv = face.uv.map((value) => Number(value) || 0) as TextureRect;
      if (typeof face.cullface === 'string') built.cullface = face.cullface;
      if (Number.isFinite(Number(face.rotation))) built.rotation = Number(face.rotation);
      if (Number.isFinite(Number(face.tintindex))) built.tintindex = Number(face.tintindex);
      faces[side] = built;
    }
    elements.push({ from: vec3(element?.from, [0, 0, 0]), to: vec3(element?.to, [16, 16, 16]), faces });
  }
  const parent = typeof raw.parent === 'string' ? raw.parent : undefined;
  const image = typeof raw.image === 'string' ? raw.image : undefined;
  return { textures, elements, ...(parent ? { parent } : {}), ...(image ? { image } : {}) };
}

export function flattenModels(pack: TexturePack, id: string, seen: Set<string> = new Set()): ResourceModel[] {
  const key = legacyPackId(id);
  if (seen.has(key)) return [];
  const data = pack.models[key];
  if (!data) return [];
  seen.add(key);
  const raw = (data && typeof data === 'object' ? data : {}) as RawModelFile;
  const parents = typeof raw.parent === 'string' ? flattenModels(pack, raw.parent, seen) : [];
  const own = parseModel(data);
  const elements = own.elements.length ? own.elements : (parents[0]?.elements ?? []);
  const textures = { ...(parents[0]?.textures ?? {}), ...own.textures };
  const image = own.image ?? parents[0]?.image;
  return [{ textures, elements, ...(image ? { image } : {}) }].concat(parents);
}

export function resolveSpriteId(model: ResourceModel, texture: string, textures: Record<string, TextureRect>): string | null {
  let sprite: string = texture;  const seen = new Set<string>();
  while (sprite.startsWith('#')) {
    const key = sprite.slice(1);
    if (seen.has(key)) return null;
    seen.add(key);
    const parent = model.textures[key];
    if (parent === undefined) return null;
    sprite = parent;
  }
  if (Object.prototype.hasOwnProperty.call(textures, sprite)) return sprite;
  const bare = sprite.slice(sprite.lastIndexOf('/') + 1);
  return Object.prototype.hasOwnProperty.call(textures, `block/${bare}`) ? `block/${bare}` : null;
}

export type RawVariant = { model?: unknown; x?: number; y?: number; uvlock?: boolean };
export type RawBlockState = { variants?: Record<string, RawVariant | RawVariant[]>; multipart?: Array<{ when?: unknown; apply?: RawVariant | RawVariant[] }> };

function toNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toSelection(variant: RawVariant | undefined): VariantSelection | null {
  return variant && typeof variant.model === 'string' ? { model: variant.model, x: toNumber(variant.x), y: toNumber(variant.y), uvLock: Boolean(variant.uvlock) } : null;
}
export function matchesCondition(when: unknown, actual: string | undefined): boolean {
  const value = actual ?? 'false';
  if (typeof when === 'string') return when.split('|').some((option) => option === value);
  if (when && typeof when === 'object') {
    const range = when as { min?: unknown; max?: unknown };
    if (range.min === undefined && range.max === undefined) return false;
    const number = Number(value);
    if (!Number.isFinite(number)) return false;
    if (range.min !== undefined && number < Number(range.min)) return false;
    if (range.max !== undefined && number > Number(range.max)) return false;
    return true;
  }
  return false;
}

function matchesCase(when: unknown, properties: Record<string, string>): boolean {
  if (!when) return true;
  const rule = when as { OR?: unknown; AND?: unknown[]; [key: string]: unknown };
  if (Array.isArray(rule.OR)) return rule.OR.some((branch) => matchesCase(branch, properties));
  if (Array.isArray(rule.AND)) return rule.AND.every((branch) => matchesCase(branch, properties));
  for (const [key, value] of Object.entries(rule)) {
    if (key === 'OR' || key === 'AND') continue;
    if (!matchesCondition(value, properties[key])) return false;
  }
  return true;
}

function normalizeVariantKey(key: string): string {
  return key.split(',').map((part) => part.trim()).filter(Boolean).sort().join(',');
}

export function selectVariants(pack: TexturePack, state: BlockState): VariantSelection[] {
  const definition = pack.blockstates[legacyPackId(state.id)] as RawBlockState | undefined;
  if (!definition) return [];
  const properties = state.properties ?? {};
  if (definition.variants && typeof definition.variants === 'object') {
    const keys = Object.keys(definition.variants).sort((left, right) => left.length - right.length);
    const wanted = normalizeVariantKey(Object.keys(properties).map((key) => `${key}=${properties[key]}`).join(','));
    let chosen = keys.find((key) => normalizeVariantKey(key) === wanted);
    if (chosen === undefined) chosen = keys.find((key) => matchesCase(Object.fromEntries(key.split(',').filter(Boolean).map((part) => part.split('=').slice(0, 2))), properties));
    const value = definition.variants[chosen ?? keys[0]];
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return list.map(toSelection).filter((entry): entry is VariantSelection => entry !== null);
  }
  if (Array.isArray(definition.multipart)) {
    return definition.multipart
      .filter((part) => matchesCase(part.when, properties))
      .map((part) => toSelection(Array.isArray(part.apply) ? part.apply[0] : part.apply))
      .filter((entry): entry is VariantSelection => entry !== null);
  }
  return [];
}
export function modelForState(pack: TexturePack, state: BlockState): { model: ResourceModel; x: number; y: number; uvLock: boolean } | null {
  const variant = selectVariants(pack, state)[0];
  if (!variant) return null;
  const flattened = flattenModels(pack, variant.model)[0];
  if (!flattened || !flattened.elements.length) return null;
  return { model: flattened, x: variant.x, y: variant.y, uvLock: variant.uvLock };
}

export function modelsForState(pack: TexturePack, state: BlockState): Array<{ model: ResourceModel; x: number; y: number; uvLock: boolean }> {
  const result: Array<{ model: ResourceModel; x: number; y: number; uvLock: boolean }> = [];
  for (const variant of selectVariants(pack, state)) {
    for (const model of flattenModels(pack, variant.model)) {
      if (model.elements.length) result.push({ model, x: variant.x, y: variant.y, uvLock: variant.uvLock });
    }
  }
  return result;
}
export function loadTexturePackFromJson(path: string | URL): TexturePack {
  const nodeFs = process.getBuiltinModule('node:fs');
  const text = path instanceof URL ? decodeFileUrl(path.href) : path;
  const directory = text.slice(0, Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')));
  const resolve = (name: string): string => `${directory}/${name}`;
  const join = resolve('atlas.png');
  const readText = (file: string | URL): string => nodeFs.readFileSync(file, 'utf8');
  const lines = (name: string): string[] => readText(resolve(name)).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const assets = JSON.parse(readText(path)) as { blockstates: Record<string, unknown>; models: Record<string, unknown>; textures: Record<string, TextureRect> };
  const png = nodeFs.readFileSync(join) as unknown as Uint8Array;
  const width = ((png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19]) >>> 0;
  const height = ((png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23]) >>> 0;
  const emissiveEntries = JSON.parse(readText(resolve('block-flags/emissive.json'))) as Record<string, { intensity?: number }>;
  const emissive: Record<string, number> = {};
  for (const [id, entry] of Object.entries(emissiveEntries)) emissive[id] = Number(entry.intensity ?? 1);
  return createTexturePack({
    blockstates: assets.blockstates,
    models: assets.models,
    textures: assets.textures,
    atlasWidth: width,
    atlasHeight: height,
    flags: { opaque: lines('block-flags/opaque.txt'), transparent: lines('block-flags/transparent.txt'), nonSelfCulling: lines('block-flags/non_self_culling.txt'), emissive },
  });
}
