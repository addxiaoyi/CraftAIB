import { BlockDefinition, BlockModel, TextureAtlas, loadDefaultPackResources, type Resources } from '@mattzh72/lodestone';
import { appendPackTextures, readPackJson, resourceId, unpackResources, type TextureRect } from './packAtlas';
import { invalidatePackFiles, loadPackFile } from './packFiles';

type DefaultPack = Awaited<ReturnType<typeof loadDefaultPackResources>>;
type ModelJson = { parent?: string; textures?: Record<string, string>; elements?: Array<{ faces?: Record<string, { texture: string }> }> };
const defaultsCache = new Map<string, Promise<DefaultPack>>();
const decodedCache = new WeakMap<File, Promise<Resources>>();
const fullId = (id: string) => id.includes(':') ? id : `minecraft:${id}`;

export function loadDefaultPackCached(baseUrl: string): Promise<DefaultPack> {
  let pending = defaultsCache.get(baseUrl);
  if (!pending) {
    pending = loadDefaultPackResources({ baseUrl, fetch: (input) => loadPackFile(input instanceof Request ? input.url : String(input)) }).catch((error) => {
      defaultsCache.delete(baseUrl);
      invalidatePackFiles(baseUrl);
      throw error;
    });
    defaultsCache.set(baseUrl, pending);
  }
  return pending;
}

export function decodePackCached(file: File, defaults: DefaultPack): Promise<Resources> {
  let pending = decodedCache.get(file);
  if (!pending) {
    pending = decodePack(file, defaults).catch((error) => {
      decodedCache.delete(file);
      throw error;
    });
    decodedCache.set(file, pending);
  }
  return pending;
}

function compileModels(models: Record<string, ModelJson>, textures: Record<string, TextureRect>, used: Set<string>): Map<string, BlockModel> {
  const flattened = new Map<string, ModelJson>();
  function flatten(key: string, parents = new Set<string>()): ModelJson {
    const cached = flattened.get(key);
    if (cached) return cached;
    if (parents.has(key) || parents.size > 100) throw new Error(`Resource pack has a cyclic model parent: ${key}`);
    const model = models[key];
    if (!model) throw new Error(`Resource pack model is missing: ${key}`);
    const parent = model.parent ? flatten(fullId(model.parent), new Set([...parents, key])) : {};
    const merged = { ...parent, ...model, parent: undefined, textures: { ...parent.textures, ...model.textures } };
    flattened.set(key, merged);
    return merged;
  }
  const compiled = new Map<string, BlockModel>();
  for (const key of used) {
    const model = flatten(key);
    if (model.elements && !Array.isArray(model.elements)) throw new Error(`Invalid model elements: ${key}`);
    for (const element of model.elements ?? []) {
      for (const face of Object.values(element.faces ?? {})) {
        // Some bundled models use bare local variables; standard packs use #variable.
        if (Object.hasOwn(model.textures ?? {}, face.texture)) face.texture = `#${face.texture}`;
        let ref = face.texture;
        const seen = new Set<string>();
        while (typeof ref === 'string' && ref.startsWith('#')) {
          if (seen.has(ref)) throw new Error(`Resource pack has a cyclic texture variable: ${key} ${ref}`);
          seen.add(ref);
          ref = model.textures?.[ref.slice(1)] ?? '';
        }
        if (!ref || !Object.hasOwn(textures, fullId(ref))) throw new Error(`Resource pack texture is missing: ${key} ${ref || face.texture}`);
      }
    }
    compiled.set(key, BlockModel.fromJson(model));
  }
  return compiled;
}

function validateModel(model: Record<string, unknown>, path: string): void {
  const invalid = () => { throw new Error(`Invalid resource pack model: ${path}`); };
  const vector = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (model.parent !== undefined && typeof model.parent !== 'string') invalid();
  if (model.textures !== undefined && (!model.textures || typeof model.textures !== 'object' || Array.isArray(model.textures) || Object.values(model.textures).some((ref) => typeof ref !== 'string'))) invalid();
  if (model.elements === undefined) return;
  if (!Array.isArray(model.elements)) invalid();
  for (const element of model.elements as Array<Record<string, unknown>>) {
    if (!element || !vector(element.from) || !vector(element.to)) invalid();
    if (element.rotation !== undefined) {
      const rotation = element.rotation as { origin?: unknown; axis?: string; angle?: number };
      if (!rotation || !vector(rotation.origin) || !['x', 'y', 'z'].includes(rotation.axis ?? '') || !Number.isFinite(rotation.angle)) invalid();
    }
    if (element.faces === undefined) continue;
    if (!element.faces || typeof element.faces !== 'object' || Array.isArray(element.faces)) invalid();
    for (const face of Object.values(element.faces as Record<string, { texture?: unknown; rotation?: number; uv?: number[] }>)) {
      if (!face || typeof face.texture !== 'string' || (face.rotation !== undefined && ![0, 90, 180, 270].includes(face.rotation))) invalid();
      if (face.uv !== undefined && (!Array.isArray(face.uv) || face.uv.length !== 4 || !face.uv.every(Number.isFinite))) invalid();
    }
  }
}

async function decodePack(file: File, defaults: DefaultPack): Promise<Resources> {
  const files = await unpackResources(file);
  if (!Object.keys(files).length) throw new Error('The ZIP contains no supported Minecraft resource assets.');
  const assets = structuredClone(defaults.assets);
  for (const [path, bytes] of Object.entries(files)) {
    const match = path.match(/assets\/([^/]+)\/(blockstates|models)\/(.+)\.json$/);
    if (!match) continue;
    const bucket = match[2] as 'blockstates' | 'models';
    const value = readPackJson(bytes, path);
    if (bucket === 'models') validateModel(value, path);
    assets[bucket][resourceId(match[1], match[3])] = value;
  }
  const atlas = await appendPackTextures(files, assets.textures, defaults.atlas);
  const textures = Object.fromEntries(Object.entries(assets.textures).map(([key, rect]) => [fullId(key), rect]));
  const used = new Set<string>();
  for (const [key, value] of Object.entries(assets.blockstates)) {
    const state = value as { variants?: Record<string, unknown>; multipart?: Array<{ apply: unknown }> };
    for (const entry of [...Object.values(state.variants ?? {}), ...(state.multipart ?? []).map((part) => part.apply)]) {
      for (const candidate of (Array.isArray(entry) ? entry : [entry]) as Array<{ model?: string }>) {
        if (typeof candidate?.model !== 'string') throw new Error(`Invalid resource pack blockstate model: ${key}`);
        used.add(fullId(candidate.model));
      }
    }
  }
  const models = compileModels(Object.fromEntries(Object.entries(assets.models).map(([key, value]) => [fullId(key), value as ModelJson])), textures, used);
  for (const id of used) if (!models.has(id)) throw new Error(`Resource pack blockstate references a missing model: ${id}`);
  const definitions = new Map(Object.entries(assets.blockstates).map(([key, value]) => [fullId(key), BlockDefinition.fromJson(value)]));
  const customTextures = new Set(Object.keys(files).flatMap((path) => {
    const match = path.match(/assets\/([^/]+)\/textures\/(.+)\.png$/);
    return match ? [`${match[1]}:${match[2]}`] : [];
  }));
  const uv = Object.fromEntries(Object.entries(textures).map(([key, [x, y, width, height]]) => {
    const custom = customTextures.has(key);
    // Bundled block animations are vertical strips; uploaded animations were cropped from mcmeta.
    const frameHeight = !custom && key.startsWith('minecraft:block/') ? Math.min(width, height) : height;
    return [key, [x / atlas.atlasSize, y / atlas.atlasSize, (x + width) / atlas.atlasSize, (y + frameHeight) / atlas.atlasSize] as TextureRect];
  }));
  const textureAtlas = new TextureAtlas(atlas.imageData, uv);
  return {
    ...defaults.resources,
    getBlockDefinition: (id) => definitions.get(id.toString()) ?? null,
    getBlockModel: (id) => models.get(id.toString()) ?? null,
    getTextureUV: (id) => textureAtlas.getTextureUV(id),
    getTextureAtlas: () => textureAtlas.getTextureAtlas(),
    getPixelSize: () => textureAtlas.getPixelSize(),
  };
}
