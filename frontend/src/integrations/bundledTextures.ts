import { invalidatePackFiles, loadPackFile } from './packFiles.ts';

type Model = { parent?: string; textures?: Record<string, string> };
type Assets = {
  textures: Record<string, [number, number, number, number]>;
  models: Record<string, Model>;
  blockstates: Record<string, { variants?: Record<string, { model: string } | Array<{ model: string }>>; multipart?: Array<{ apply: { model: string } | Array<{ model: string }> }> }>;
};
type BundledTextures = { assets: Assets; canvas: HTMLCanvasElement };
let pending: Promise<BundledTextures> | undefined;

export function loadBundledTextures(): Promise<BundledTextures> {
  if (!pending) {
    pending = readBundledTextures().catch((error) => {
      pending = undefined;
      invalidatePackFiles(`${window.location.origin}/lodestone-default-pack/`);
      throw error;
    });
  }
  return pending;
}

async function readBundledTextures(): Promise<BundledTextures> {
  const responses = await Promise.all(['assets.json', 'atlas.png'].map((name) => loadPackFile(`${window.location.origin}/lodestone-default-pack/${name}`)));
  const assets = await responses[0].json() as Assets;
  const bitmap = await createImageBitmap(await responses[1].blob());
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to decode bundled Minecraft textures.');
    context.drawImage(bitmap, 0, 0);
    return { assets, canvas };
  } finally {
    bitmap.close();
  }
}

const stripNamespace = (id: string) => id.replace(/^minecraft:/, '');

function modelTextures(assets: Assets, id: string, seen = new Set<string>()): Record<string, string> {
  const key = stripNamespace(id);
  if (seen.has(key)) throw new Error(`Cyclic bundled texture model: ${key}`);
  const model = assets.models[key];
  if (!model) return {};
  seen.add(key);
  return { ...(model.parent ? modelTextures(assets, model.parent, seen) : {}), ...model.textures };
}

export function blockTextureName(assets: Assets, blockId: string): string | null {
  const name = stripNamespace(blockId);
  if (assets.textures[`block/${name}`]) return `block/${name}`;
  const state = assets.blockstates[name === 'grass' ? 'short_grass' : name];
  const variant = Object.values(state?.variants ?? {})[0] ?? state?.multipart?.[0]?.apply;
  const model = (Array.isArray(variant) ? variant[0] : variant)?.model;
  if (!model) return null;
  const textures = modelTextures(assets, model);
  for (const variable of ['all', 'side', 'particle', 'texture', ...Object.keys(textures)]) {
    let ref = textures[variable];
    const seen = new Set<string>();
    while (ref?.startsWith('#')) {
      if (seen.has(ref)) throw new Error(`Cyclic bundled texture variable: ${model} ${ref}`);
      seen.add(ref);
      ref = textures[ref.slice(1)];
    }
    if (ref && assets.textures[stripNamespace(ref)]) return stripNamespace(ref);
  }
  return null;
}

export function cropBlockTexture(pack: BundledTextures, name: string): { canvas: HTMLCanvasElement; translucent: boolean } {
  const [x, y, width, height] = pack.assets.textures[name];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.min(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`Unable to crop bundled texture: ${name}`);
  context.imageSmoothingEnabled = false;
  context.drawImage(pack.canvas, x, y, width, canvas.height, 0, 0, width, canvas.height);
  const pixels = context.getImageData(0, 0, width, canvas.height).data;
  let translucent = false;
  for (let alpha = 3; alpha < pixels.length; alpha += 4) {
    if (pixels[alpha] > 0 && pixels[alpha] < 255) { translucent = true; break; }
  }
  return { canvas, translucent };
}
