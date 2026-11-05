import { unzipSync } from 'fflate';

export type TextureRect = [number, number, number, number];
export type PackAtlas = { imageData: ImageData; atlasSize: number };
const MAX_PACK_BYTES = 128 * 1024 * 1024;
const MAX_ATLAS_SIZE = 4096;
const MAX_DECODED_PIXELS = MAX_ATLAS_SIZE * MAX_ATLAS_SIZE;

export function readPackJson(bytes: Uint8Array, path: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
    return value as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid resource pack JSON: ${path}`, { cause: error });
  }
}

export async function unpackResources(file: File): Promise<Record<string, Uint8Array>> {
  if (file.size > MAX_PACK_BYTES) throw new Error('Resource pack exceeds the 128 MiB limit.');
  let expandedBytes = 0;
  try {
    return unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => {
      const supported = /^(?:[^/]+\/)?assets\/[a-z0-9_.-]+\/(?:blockstates|models|textures)\/.+\.(?:json|png|png\.mcmeta)$/.test(entry.name);
      if (!supported) return false;
      expandedBytes += entry.originalSize;
      if (expandedBytes > MAX_PACK_BYTES) throw new Error('Expanded resource pack exceeds the 128 MiB limit.');
      return true;
    } });
  } catch (error) {
    throw new Error('Resource pack ZIP is invalid or exceeds the 128 MiB limit.', { cause: error });
  }
}

export function resourceId(namespace: string, path: string): string {
  return namespace === 'minecraft' ? path : `${namespace}:${path}`;
}

function frameRect(width: number, height: number, metadata?: Record<string, unknown>): TextureRect {
  if (metadata?.animation === undefined) return [0, 0, width, height];
  if (!metadata.animation || typeof metadata.animation !== 'object' || Array.isArray(metadata.animation)) throw new Error('Texture animation metadata must be an object.');
  const animation = metadata.animation as { width?: number; height?: number; frames?: Array<number | { index: number; time?: number }> };
  if (animation.frames !== undefined && !Array.isArray(animation.frames)) throw new Error('Texture animation frames must be an array.');
  const frameWidth = animation.width ?? (animation.height === undefined ? Math.min(width, height) : width);
  const frameHeight = animation.height ?? (animation.width === undefined ? frameWidth : height);
  const first = animation.frames?.[0] ?? 0;
  const index = typeof first === 'number' ? first : first?.index;
  if (![frameWidth, frameHeight].every((size) => Number.isInteger(size) && size > 0) || width % frameWidth || height % frameHeight || !Number.isInteger(index) || index < 0 || index >= (width / frameWidth) * (height / frameHeight)) {
    throw new Error('Invalid texture animation frame dimensions or index.');
  }
  for (const frame of animation.frames ?? []) {
    const frameIndex = typeof frame === 'number' ? frame : frame?.index;
    const duration = typeof frame === 'number' ? 1 : frame?.time ?? 1;
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= (width / frameWidth) * (height / frameHeight) || !Number.isInteger(duration) || duration <= 0) throw new Error('Invalid texture animation frame or duration.');
  }
  // The preview is static; respect the pack's first declared frame, without squeezing the strip.
  return [(index % (width / frameWidth)) * frameWidth, Math.floor(index / (width / frameWidth)) * frameHeight, frameWidth, frameHeight];
}

export async function appendPackTextures(files: Record<string, Uint8Array>, textures: Record<string, TextureRect>, defaults: PackAtlas): Promise<PackAtlas> {
  const entries = Object.entries(files).filter(([path]) => /\/textures\/.+\.png$/.test(path));
  if (!entries.length) return defaults;
  const images: Array<{ image: ImageBitmap; rect: TextureRect; key: string; x: number; y: number }> = [];
  let x = 0;
  let y = defaults.atlasSize;
  let rowHeight = 0;
  let decodedPixels = 0;
  try {
    for (const [path, bytes] of entries) {
      const match = path.match(/assets\/([^/]+)\/textures\/(.+)\.png$/)!;
      const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (bytes.length < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(12) !== 0x49484452) throw new Error(`Invalid resource pack PNG: ${path}`);
      const width = header.getUint32(16);
      const height = header.getUint32(20);
      decodedPixels += width * height;
      if (!width || !height || width > MAX_ATLAS_SIZE || decodedPixels > MAX_DECODED_PIXELS) throw new Error('Resource pack textures exceed the preview image size limit.');
      let image: ImageBitmap;
      try {
        image = await createImageBitmap(new Blob([new Uint8Array(bytes).buffer], { type: 'image/png' }));
      } catch (error) {
        throw new Error(`Invalid resource pack PNG: ${path}`, { cause: error });
      }
      const tile = { image, rect: [0, 0, 0, 0] as TextureRect, key: resourceId(match[1], match[2]), x: 0, y: 0 };
      images.push(tile);
      const metadata = files[`${path}.mcmeta`];
      tile.rect = frameRect(image.width, image.height, metadata ? readPackJson(metadata, `${path}.mcmeta`) : undefined);
      const [, , frameWidth, frameHeight] = tile.rect;
      if (x + frameWidth > MAX_ATLAS_SIZE) { x = 0; y += rowHeight; rowHeight = 0; }
      if (y + frameHeight > MAX_ATLAS_SIZE) throw new Error('Resource pack textures exceed the 4096px preview atlas capacity.');
      tile.x = x;
      tile.y = y;
      x += frameWidth;
      rowHeight = Math.max(rowHeight, frameHeight);
    }
    const canvas = document.createElement('canvas');
    canvas.width = MAX_ATLAS_SIZE;
    canvas.height = MAX_ATLAS_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to create a resource pack atlas canvas.');
    context.imageSmoothingEnabled = false;
    // Keep the bundled atlas at its original coordinates, with a separate shelf for custom pixels.
    context.putImageData(defaults.imageData, 0, 0);
    for (const { image, rect: [sx, sy, width, height], key, x: tx, y: ty } of images) {
      context.drawImage(image, sx, sy, width, height, tx, ty, width, height);
      textures[key] = [tx, ty, width, height];
    }
    return { imageData: context.getImageData(0, 0, canvas.width, canvas.height), atlasSize: canvas.width };
  } finally {
    images.forEach(({ image }) => image.close());
  }
}
