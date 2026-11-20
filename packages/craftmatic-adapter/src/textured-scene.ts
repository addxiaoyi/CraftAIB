import type { BlockGrid } from '@craftaib/core';
import { validateGrid } from '@craftaib/core';
import { modelsForState, resolveSpriteId, uniqueResourceId, legacyPackId, type ModelElement, type ResourceModel, type TexturePack } from './texture-pack.js';

export type TexturedFace = { vertices: Array<[number, number, number]>; uv: Array<[number, number]>; sprite: string; tint: [number, number, number] | null; emissive: number };
export type TexturedCell = { x: number; y: number; z: number; block: string; sprite: string };
export type TexturedScene = { faces: TexturedFace[]; cells: TexturedCell[]; typed: boolean; atlas: { width: number; height: number }; missing: string[]; totalFaces: number; textureCount: number };

export type Corner = [number, number, number];
export type Side = 'west' | 'east' | 'down' | 'up' | 'north' | 'south';
export type Quad = { vertices: Corner[]; uv: Array<[number, number]>; sides: Side[] };
export type VariantModel = { model: ResourceModel; x: number; y: number; uvLock: boolean };
export type FaceJson = { texture?: string; uv?: number[]; cullface?: string };

export const SIDES: Side[] = ['west', 'east', 'down', 'up', 'north', 'south'];

export const SIDE_VECTORS: Record<Side, Corner> = { west: [-1, 0, 0], east: [1, 0, 0], down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1] };

export const ATLAS_TEXTURE_SIZE = 16;

export const PLANES: Record<Side, [number, number]> = {
  west: [2, 1], east: [2, 1], down: [0, 2], up: [0, 2], north: [0, 1], south: [0, 1],
};

export const CORNER_UV: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];

// Faces that run counter-clockwise relative to the south template; flipping
// their tangent keeps the quad wound outward (which also mirrors its texture).
export const MIRRORED: Record<Side, boolean> = { east: true, west: false, up: true, down: false, south: false, north: true };

function clamp16(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(16, value)) : 0;
}

function sideAxis(side: Side): number {
  return side === 'west' || side === 'east' ? 0 : side === 'down' || side === 'up' ? 1 : 2;
}

function uvAt(low: number, high: number, tile: number): number {
  const from = (low % ATLAS_TEXTURE_SIZE) / ATLAS_TEXTURE_SIZE;
  const to = (high % ATLAS_TEXTURE_SIZE) / ATLAS_TEXTURE_SIZE;
  return from + (to - from) * tile;
}

export function quadFor(side: Side, element: ModelElement, face: FaceJson): Quad {
  const own = sideAxis(side);
  const [first, second] = PLANES[side];
  const low: Corner = [clamp16(element.from[0]), clamp16(element.from[1]), clamp16(element.from[2])];
  const high: Corner = [clamp16(element.to[0]), clamp16(element.to[1]), clamp16(element.to[2])];
  const rect: [number, number, number, number] = face.uv && face.uv.length === 4 ? [Number(face.uv[0]), Number(face.uv[1]), Number(face.uv[2]), Number(face.uv[3])] : [0, 0, 16, 16];
  const mirror = MIRRORED[side];
  const vertices: Corner[] = [];
  const uv: Array<[number, number]> = [];
  for (const [du, dv] of CORNER_UV) {
    const point: Corner = [0, 0, 0];
    point[own] = side === 'east' || side === 'up' || side === 'south' ? high[own] : low[own];
    const along = mirror ? 1 - du : du;
    point[first] = along === 0 ? low[first] : high[first];
    point[second] = dv === 0 ? low[second] : high[second];
    vertices.push(point);
    uv.push([uvAt(rect[0], rect[2], along), uvAt(rect[1], rect[3], dv)]);
  }
  return { vertices, uv, sides: [side] };
}

export function shifted(point: Corner, model: VariantModel): Corner {
  let [x, y, z] = point;
  if (!model.y && !model.x) return [x, y, z];
  x -= 8;
  y -= 8;
  z -= 8;
  const yaw = (-model.y * Math.PI) / 180;
  const pitch = (-model.x * Math.PI) / 180;
  [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
  [y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
  return [x + 8, y + 8, z + 8];
}

function stateKey(state: { id: string; properties?: Record<string, string> }): string {
  const properties = Object.entries(state.properties ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join(',');
  return properties ? `${uniqueResourceId(state.id)}[${properties}]` : uniqueResourceId(state.id);
}

function solidCells(grid: BlockGrid, pack: TexturePack): Map<string, string> {
  const solid = new Map<string, string>();
  for (const cell of grid.cells) solid.set(`${cell.x},${cell.y},${cell.z}`, legacyPackId(cell.block.id));
  return solid;
}

export function buildTexturedScene(grid: BlockGrid, pack: TexturePack): TexturedScene {
  validateGrid(grid);
  const solid = solidCells(grid, pack);
  const faces: TexturedFace[] = [];
  const cells: TexturedCell[] = [];
  const missing = new Set<string>();
  for (const cell of grid.cells) {
    const variants = modelsForState(pack, cell.block).map((entry): VariantModel => ({ model: entry.model, x: entry.x, y: entry.y, uvLock: entry.uvLock }));
    if (!variants.length) {
      missing.add(stateKey(cell.block));
      continue;
    }
    for (const variant of variants) {
      for (const element of variant.model.elements) {
        for (const side of SIDES) {
          const face = element.faces[side];
          if (!face) continue;
          const [dx, dy, dz] = SIDE_VECTORS[(face.cullface ?? side) as Side] ?? SIDE_VECTORS[side];
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          const nz = cell.z + dz;
          const neighbour = solid.get(`${nx},${ny},${nz}`);
          const own = legacyPackId(cell.block.id);
          // Only full opaque cubes hide a face; leaves and other see-through solids keep same-block faces.
          if (neighbour && pack.flags.opaque.has(neighbour) && (neighbour !== own || !pack.flags.nonSelfCulling.has(own))) continue;
          const sprite = resolveSpriteId(variant.model, face.texture, pack.textures);
          if (!sprite) continue;
          const quad = quadFor(side, element, face);
          faces.push({ vertices: quad.vertices.map((point) => shifted(point, variant)), uv: quad.uv, sprite, tint: null, emissive: pack.flags.emissive.get(legacyPackId(cell.block.id)) ?? 0 });
          cells.push({ x: cell.x, y: cell.y, z: cell.z, block: stateKey(cell.block), sprite });
        }
      }
    }
  }
  return { faces, cells, typed: true, atlas: { ...pack.atlas }, missing: [...missing], totalFaces: faces.length, textureCount: Object.keys(pack.textures).length };
}
