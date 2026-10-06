import { createGrid, type BlockCell, type BlockGrid } from '@craftaib/core';

export type VoxelartcraftBlock = [number, number, number, number, number, number];

export type VoxelartcraftExport = {
  blocks: VoxelartcraftBlock[];
  palette: Array<[string, number, number, number, number, number?, boolean?]>;
  materials: number[];
};

export function fromVoxelartcraft(input: VoxelartcraftExport): BlockGrid {
  if (input.blocks.length !== input.materials.length) throw new Error('Voxelartcraft blocks/materials length mismatch.');
  const cells: BlockCell[] = input.blocks.map((block, index) => {
    const paletteEntry = input.palette[input.materials[index]];
    if (!paletteEntry) throw new Error(`Voxelartcraft palette index ${input.materials[index]} is missing.`);
    return { x: block[3], y: block[4], z: block[5], block: { id: `minecraft:${paletteEntry[0]}` }, source: 'voxelartcraft' };
  });
  if (cells.length === 0) throw new Error('Voxelartcraft produced no blocks.');
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const minZ = Math.min(...cells.map((cell) => cell.z));
  const normalized = cells.map((cell) => ({ ...cell, x: cell.x - minX, y: cell.y - minY, z: cell.z - minZ }));
  return createGrid(normalized, { width: Math.max(...normalized.map((cell) => cell.x)) + 1, height: Math.max(...normalized.map((cell) => cell.y)) + 1, length: Math.max(...normalized.map((cell) => cell.z)) + 1 }, 'voxelartcraft');
}
