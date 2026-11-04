import { createGrid, parseBlockState, validateGrid, type BlockGrid } from '@craftaib/core';
import { toSchematicLike } from './schematic.js';

export type SchematicLike = { width: number; height: number; length: number; palette: string[]; cells: Array<{ x: number; y: number; z: number; state: string | number }> };

export function fromCraftmaticSchematic(input: SchematicLike): BlockGrid {
  if (!input || !Array.isArray(input.cells) || !Array.isArray(input.palette)) throw new Error('Craftmatic schematic must contain cells and palette arrays.');
  const cells = input.cells.map((cell) => {
    if (typeof cell.state === 'number' && (!Number.isSafeInteger(cell.state) || cell.state < 0)) throw new Error('Craftmatic schematic references an invalid palette index.');
    const state = typeof cell.state === 'number' ? input.palette[cell.state] : cell.state;
    if (!state) throw new Error('Craftmatic schematic references an unknown palette entry.');
    return { x: cell.x, y: cell.y, z: cell.z, block: parseBlockState(state) };
  });
  return createGrid(cells, { width: input.width, height: input.height, length: input.length }, 'craftmatic');
}

export function toCraftmaticSchematic(grid: BlockGrid): SchematicLike {
  return toSchematicLike(grid);
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

export * from './geo-poi.js';
export * from './lego-colors.js';

export * from './structure.js';
export * from './textured-viewer.js';

export * from './litematica-placement.js';
export * from './glb-textured.js';
