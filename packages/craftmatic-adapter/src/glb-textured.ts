import { validateGrid, type BlockGrid } from '@craftaib/core';
import { buildTexturedScene, type Corner } from './textured-scene.js';
import type { TexturePack } from './texture-pack.js';

export type TexturedGlbOptions = {
  atlas?: Uint8Array | null;
  scale?: number;
};

const FLOAT = 5126;
const UINT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const HEADER = 12;
const CHUNK_HEADER = 8;

function normalOf(vertices: Corner[]): Corner {
  const [a, b, c] = vertices;
  const ab: Corner = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Corner = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal: Corner = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  return [normal[0] / length, normal[1] / length, normal[2] / length];
}

function boundsOf(positions: number[]): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  return positions.length ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
}

export function serializeTexturedGlb(grid: BlockGrid, pack: TexturePack, options: TexturedGlbOptions = {}): Uint8Array {
  validateGrid(grid);
  const scene = buildTexturedScene(grid, pack);
  const factor = Number.isFinite(options.scale) && Number(options.scale) !== 0 ? Number(options.scale) : 1;

  const positions: number[] = [];
  const normals: number[] = [];
  const coords: number[] = [];
  const emissive: number[] = [];
  const indices: number[] = [];
  for (const face of scene.faces) {
    const first = positions.length / 3;
    const normal = normalOf(face.vertices);
    for (const [index, point] of face.vertices.entries()) {
      positions.push(point[0] * factor, point[1] * factor, point[2] * factor);
      normals.push(normal[0], normal[1], normal[2]);
      // glTF reads TEXCOORD_0 with the origin at the top left, the pack atlas at the bottom left.
      coords.push(face.uv[index]?.[0] ?? 0, 1 - (face.uv[index]?.[1] ?? 0));
      emissive.push(face.emissive);
    }
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  return packGlb(positions, normals, coords, emissive, indices, boundsOf(positions), options.atlas ?? null);
}

function packGlb(
  positions: number[],
  normals: number[],
  coords: number[],
  emissive: number[],
  indices: number[],
  bounds: { min: number[]; max: number[] },
  atlas: Uint8Array | null,
): Uint8Array {
  const parts: Uint8Array[] = [];
  const views: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  let offset = 0;
  const push = (bytes: Uint8Array, target?: number): number => {
    while (offset % 4) {
      parts.push(new Uint8Array(1));
      offset += 1;
    }
    const view: Record<string, unknown> = { buffer: 0, byteOffset: offset, byteLength: bytes.byteLength };
    if (target) view.target = target;
    views.push(view);
    parts.push(bytes);
    offset += bytes.byteLength;
    return views.length - 1;
  };
  const floatAccessor = (values: number[], type: string, stride: number, box?: { min: number[]; max: number[] }): number => {
    const bufferView = push(new Uint8Array(Float32Array.from(values).buffer), ARRAY_BUFFER);
    const accessor: Record<string, unknown> = { bufferView, byteOffset: 0, componentType: FLOAT, count: values.length / stride, type };
    if (box) {
      accessor.min = box.min;
      accessor.max = box.max;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };
  const position = floatAccessor(positions, 'VEC3', 3, bounds);
  const normal = floatAccessor(normals, 'VEC3', 3);
  const coord = floatAccessor(coords, 'VEC2', 2);
  const tint = floatAccessor(emissive, 'SCALAR', 1);
  const indexView = push(new Uint8Array(Uint32Array.from(indices).buffer), ELEMENT_ARRAY_BUFFER);
  accessors.push({ bufferView: indexView, byteOffset: 0, componentType: UINT, count: indices.length, type: 'SCALAR' });
  const index = accessors.length - 1;
  const imageView = atlas ? push(atlas) : -1;
  const size = offset;

  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'CraftAIB' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'CraftAIB build' }],
  };
  json.bufferViews = views;
  json.accessors = accessors;
  json.buffers = [{ byteLength: size }];
  const materials: Array<Record<string, unknown>> = [
    { name: 'solid', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }, doubleSided: true },
  ];

  const attributes: Record<string, number> = { POSITION: position, NORMAL: normal, TEXCOORD_0: coord, _EMISSIVE: tint };
  const primitive: Record<string, unknown> = { attributes, indices: index, material: 0, mode: 4 };
  if (atlas) {
    materials.push({
      name: 'atlas',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.9 },
      alphaMode: 'MASK',
      alphaCutoff: 0.5,
      doubleSided: true,
    });
    primitive.material = 1;
    json.images = [{ bufferView: imageView, mimeType: 'image/png' }];
    json.samplers = [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }];
    json.textures = [{ sampler: 0, source: 0 }];
  }
  json.materials = materials;
  json.meshes = [{ primitives: [primitive] }];
  return writeGlb(parts, json);
}

function chunk(bytes: Uint8Array, kind: number, fill: number): Uint8Array {
  const padded = (bytes.byteLength + 3) & ~3;
  const out = new Uint8Array(CHUNK_HEADER + padded);
  const view = new DataView(out.buffer);
  view.setUint32(0, padded, true);
  view.setUint32(4, kind, true);
  out.set(bytes, CHUNK_HEADER);
  out.fill(fill, CHUNK_HEADER + bytes.byteLength);
  return out;
}

function writeGlb(parts: Uint8Array[], json: Record<string, unknown>): Uint8Array {
  let size = 0;
  for (const part of parts) size += part.byteLength;
  const bin = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bin.set(part, at);
    at += part.byteLength;
  }
  const jsonChunk = chunk(new TextEncoder().encode(JSON.stringify(json)), JSON_CHUNK, 0x20);
  const binChunk = chunk(bin, BIN_CHUNK, 0);
  const out = new Uint8Array(HEADER + jsonChunk.byteLength + binChunk.byteLength);
  const head = new DataView(out.buffer);
  head.setUint32(0, MAGIC, true);
  head.setUint32(4, 2, true);
  head.setUint32(8, out.byteLength, true);
  out.set(jsonChunk, HEADER);
  out.set(binChunk, HEADER + jsonChunk.byteLength);
  return out;
}
