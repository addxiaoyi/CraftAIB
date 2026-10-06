import { validateGrid, type BlockGrid, type SceneGraph } from '@craftaib/core';

export type SchematicLike = { width: number; height: number; length: number; palette: string[]; cells: Array<{ x: number; y: number; z: number; state: string | number }> };

export function fromCraftmaticSchematic(input: SchematicLike): BlockGrid {
  const cells = input.cells.map((cell) => {
    const id = typeof cell.state === 'number' ? input.palette[cell.state] : cell.state;
    if (!id) throw new Error('Craftmatic schematic references an unknown palette entry.');
    return { x: cell.x, y: cell.y, z: cell.z, block: { id }, source: 'craftmatic' as const };
  });
  const grid: BlockGrid = { version: 1, width: input.width, height: input.height, length: input.length, cells, palette: [{ id: 'minecraft:air' }, ...input.palette.map((id) => ({ id }))], coordinateSystem: 'xyz', origin: { x: 0, y: 0, z: 0 } };
  return validateGrid(grid);
}

export function toCraftmaticScene(grid: BlockGrid): SceneGraph {
  validateGrid(grid);
  return { version: 1, grids: [grid], metadata: { adapter: 'craftmatic', renderer: 'three' } };
}
