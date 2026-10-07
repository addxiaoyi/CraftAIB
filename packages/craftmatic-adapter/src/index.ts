import { validateGrid, type BlockGrid } from '@craftaib/core';

export type SchematicLike = { width: number; height: number; length: number; palette: string[]; cells: Array<{ x: number; y: number; z: number; state: string | number }> };

export function fromCraftmaticSchematic(input: SchematicLike): BlockGrid {
  const cells = input.cells.map((cell) => { const id = typeof cell.state === 'number' ? input.palette[cell.state] : cell.state; if (!id) throw new Error('Craftmatic schematic references an unknown palette entry.'); return { x: cell.x, y: cell.y, z: cell.z, block: { id }, source: 'craftmatic' as const }; });
  return validateGrid({ version: 1, width: input.width, height: input.height, length: input.length, cells, palette: [{ id: 'minecraft:air' }, ...input.palette.map((id) => ({ id }))], coordinateSystem: 'xyz', origin: { x: 0, y: 0, z: 0 } });
}

export function toCraftmaticSchematic(grid: BlockGrid): SchematicLike {
  validateGrid(grid);
  const palette = ['minecraft:air']; const indexes = new Map([['minecraft:air', 0]]);
  for (const cell of grid.cells) { if (!indexes.has(cell.block.id)) { indexes.set(cell.block.id, palette.length); palette.push(cell.block.id); } }
  return { width: grid.width, height: grid.height, length: grid.length, palette, cells: grid.cells.map((cell) => ({ x: cell.x, y: cell.y, z: cell.z, state: indexes.get(cell.block.id) ?? 0 })) };
}

export function toCraftmaticScene(grid: BlockGrid) { validateGrid(grid); return { version: 1 as const, grids: [grid], metadata: { adapter: 'craftmatic', renderer: 'three' } }; }
export * from './schematic.js';
export * from './parse.js';
export * from './litematic-parse.js';
export * from './viewer.js';
export * from './glb.js';
export * from './lego.js';
export * from './ldraw.js';
export * from './lego-scene.js';
export * from './lego-resources.js';
export * from './geo.js';
export * from './geojson.js';
