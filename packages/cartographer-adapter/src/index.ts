import { createGrid, type BlockGrid, type PixelMap } from '@craftaib/core';

export type MapArtCell = { id: string; properties?: Record<string, string>; x: number; y: number; z: number; hue?: number };

export type MapArtOptions = {
  width: number;
  height: number;
  paletteId?: string;
  staircasing?: 'none' | 'left' | 'right' | 'balanced';
};

export function fromCartographerCells(cells: MapArtCell[], options: MapArtOptions): BlockGrid {
  if (options.width < 1 || options.height < 1) throw new Error('Map Art dimensions must be positive.');
  return createGrid(cells.map((cell) => ({ x: cell.x, y: cell.y, z: cell.z, block: { id: cell.id, properties: cell.properties }, source: 'cartographer' })), { width: options.width, height: options.height, length: Math.max(1, ...cells.map((cell) => cell.z + 1)) }, 'cartographer');
}

export function toCartographerPixels(grid: BlockGrid): PixelMap {
  if (grid.length !== 1) throw new Error('Cartographer pixel export requires a single-layer grid.');
  const pixels = Array.from({ length: grid.width * grid.height }, (_, index) => {
    const x = index % grid.width;
    const y = Math.floor(index / grid.width);
    const cell = grid.cells.find((candidate) => candidate.x === x && candidate.y === y && candidate.z === 0);
    return cell ? { r: 0, g: 0, b: 0, a: 255 } : { r: 0, g: 0, b: 0, a: 0 };
  });
  return { width: grid.width, height: grid.height, pixels, paletteId: 'minecraft-map-art' };
}
export * from './map-art.js';
export * from './litematica.js';
