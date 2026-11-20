import { createGrid, type BlockGrid } from '@craftaib/core';
import type { BlockWrite, BuilderRecorder } from './recorder.js';
import { AIR_BLOCK } from './spec.js';

export type VoxelizeOptions = {
  /** Unsigned size of each voxel; BuilderGPT defaults to 1 block per voxel. */
  voxelSize?: number;
};

export type VoxelMask = {
  /** World-space offset of voxel coordinate (0, 0, 0). */
  x: number;
  y: number;
  z: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  voxelSize: number;
  /** One entry per occupied block, in the recorder's final cell order. */
  voxels: BlockGrid['cells'];
  /** Ordered per-voxel tokens, mirroring BuilderGPT's world replay. */
  fills: Array<{ box: number; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; block: string | null }>;
};

export const MAX_MASK_BLOCKS = 65_536;

const AIR = AIR_BLOCK;

export function formatBuilderBlock(block: BlockWrite['block']): string {
  if (!block) return AIR;
  const properties = Object.entries(block.properties ?? {}).map(([key, value]) => `${key}=${value}`).join(',');
  return properties ? `${block.id}[${properties}]` : block.id;
}

/**
 * Applies recorded writes in order onto a sparse world. Writes to one
 * position behave like repeated vanilla `/setblock` calls: the last one wins.
 * A `keep` write is a no-op when the cell is already filled.
 */
export function voxelMaskFill(recorder: BuilderRecorder): Map<string, BlockGrid['cells'][number]> {
  const world = new Map<string, BlockGrid['cells'][number]>();
  for (const write of recorder.writes) {
    const key = `${write.x},${write.y},${write.z}`;
    if (write.block === null || write.block.id === AIR) {
      if (write.mode === 'keep') continue;
      world.delete(key);
      continue;
    }
    if (write.mode === 'keep' && world.has(key)) continue;
    world.set(key, { x: write.x, y: write.y, z: write.z, block: { ...write.block }, source: 'craftmatic' });
  }
  return world;
}

/**
 * Turns the recorded writes into BuilderGPT's voxel mask: a rectilinear voxel
 * field that carries its own offset, so a script may build at negative or
 * arbitrary coordinates and still come out as a zero-based BlockGrid.
 */
export function recorderToVoxelMask(recorder: BuilderRecorder, options: VoxelizeOptions = {}): VoxelMask {
  const voxelSize = Math.max(1, Math.floor(options.voxelSize ?? 1));
  const world = [...voxelMaskFill(recorder).values()];
  const empty: VoxelMask = { x: 0, y: 0, z: 0, sizeX: 0, sizeY: 0, sizeZ: 0, voxelSize, voxels: [], fills: [] };
  if (!world.length) return empty;
  const minX = Math.min(...world.map((cell) => cell.x));
  const maxX = Math.max(...world.map((cell) => cell.x));
  const minY = Math.min(...world.map((cell) => cell.y));
  const maxY = Math.max(...world.map((cell) => cell.y));
  const minZ = Math.min(...world.map((cell) => cell.z));
  const maxZ = Math.max(...world.map((cell) => cell.z));
  const voxels = world.map((cell) => ({ ...cell, x: Math.max(0, Math.round((cell.x - minX) / voxelSize)), y: Math.max(0, Math.round((cell.y - minY) / voxelSize)), z: Math.max(0, Math.round((cell.z - minZ) / voxelSize)), source: 'craftmatic' as const }));
  const spanX = Math.max(1, Math.max(...voxels.map((cell) => cell.x)) + 1);
  const spanY = Math.max(1, Math.max(...voxels.map((cell) => cell.y)) + 1);
  const spanZ = Math.max(1, Math.max(...voxels.map((cell) => cell.z)) + 1);
  const fills = recorder.writes.map((write) => ({ box: write.box, minX: write.x, minY: write.y, minZ: write.z, maxX: write.x, maxY: write.y, maxZ: write.z, block: write.block ? formatBuilderBlock(write.block) : AIR }));
  return { x: minX, y: minY, z: minZ, sizeX: spanX, sizeY: spanY, sizeZ: spanZ, voxelSize, voxels, fills };
}

export function voxelMaskToGrid(mask: VoxelMask): BlockGrid {
  validateVoxelMask(mask);
  const width = Math.max(1, mask.sizeX);
  const height = Math.max(1, mask.sizeY);
  const length = Math.max(1, mask.sizeZ);
  return createGrid(mask.voxels, { width, height, length }, 'craftmatic');
}

/** A mask must stay a finite, non-negative box with no out-of-bounds cell. */
export function validateVoxelMask(mask: VoxelMask): VoxelMask {
  if (!mask.voxels.length) return mask;
  for (const value of [mask.sizeX, mask.sizeY, mask.sizeZ, mask.voxelSize]) {
    if (!Number.isInteger(value) || value < 1) throw new Error('VoxelMask sizes and voxelSize must be positive integers.');
  }
  if (mask.voxels.length > MAX_MASK_BLOCKS) throw new Error(`VoxelMask exceeds ${MAX_MASK_BLOCKS} blocks.`);
  for (const cell of mask.voxels) {
    if (![cell.x, cell.y, cell.z].every(Number.isInteger)) throw new Error('VoxelMask coordinates must be integers.');
    if (cell.x < 0 || cell.y < 0 || cell.z < 0 || cell.x >= mask.sizeX || cell.y >= mask.sizeY || cell.z >= mask.sizeZ) throw new Error(`VoxelMask cell ${cell.x},${cell.y},${cell.z} is outside its size.`);
  }
  return mask;
}
