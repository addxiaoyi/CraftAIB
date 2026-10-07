import type { BlockGrid } from './types.js';
import { createGrid, normalizeState, validateGrid } from './grid.js';

export function mergeGrids(grids: BlockGrid[], offsets: Array<{ x: number; y: number; z: number }> = []): BlockGrid {
  if (!grids.length) throw new Error('At least one grid is required.');
  const placed = new Map<string, { x: number; y: number; z: number; block: BlockGrid['cells'][number]['block']; source: 'user' }>();
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  grids.forEach((grid, index) => {
    validateGrid(grid); const offset = offsets[index] ?? { x: 0, y: 0, z: 0 };
    for (const cell of grid.cells) { const x = cell.x + offset.x, y = cell.y + offset.y, z = cell.z + offset.z; placed.set(`${x}:${y}:${z}`, { x, y, z, block: normalizeState(cell.block), source: 'user' }); minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z); }
  });
  const cells = [...placed.values()].map((cell) => ({ ...cell, x: cell.x - minX, y: cell.y - minY, z: cell.z - minZ }));
  return createGrid(cells, { width: maxX - minX + 1, height: maxY - minY + 1, length: maxZ - minZ + 1 }, 'user');
}
