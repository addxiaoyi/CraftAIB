import type { BlockGrid, BlockState, SceneGraph } from './types.js';

const AIR = 'minecraft:air';

export function validateGrid(grid: BlockGrid): BlockGrid {
  if (grid.version !== 1 || grid.coordinateSystem !== 'xyz') throw new Error('Unsupported BlockGrid version or coordinate system.');
  for (const size of [grid.width, grid.height, grid.length]) {
    if (!Number.isInteger(size) || size < 1) throw new Error('BlockGrid dimensions must be positive integers.');
  }
  const palette = new Set(grid.palette.map((state) => normalizeState(state).id));
  if (!palette.has(AIR)) throw new Error('BlockGrid palette must contain minecraft:air.');
  const seen = new Set<string>();
  for (const cell of grid.cells) {
    if (![cell.x, cell.y, cell.z].every(Number.isInteger)) throw new Error('BlockGrid coordinates must be integers.');
    if (cell.x < 0 || cell.x >= grid.width || cell.y < 0 || cell.y >= grid.height || cell.z < 0 || cell.z >= grid.length) throw new Error('BlockGrid cell is outside its dimensions.');
    const key = `${cell.x},${cell.y},${cell.z}`;
    if (seen.has(key)) throw new Error(`Duplicate BlockGrid cell at ${key}.`);
    seen.add(key);
    if (!palette.has(normalizeState(cell.block).id)) throw new Error(`Block ${cell.block.id} is missing from the palette.`);
  }
  return grid;
}

export function normalizeState(state: BlockState): BlockState {
  if (!state.id || !/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(state.id)) throw new Error(`Invalid block state id: ${state.id}`);
  return { id: state.id.includes(':') ? state.id : `minecraft:${state.id}`, ...(state.properties ? { properties: { ...state.properties } } : {}) };
}

export function gridToScene(grid: BlockGrid, metadata: Record<string, unknown> = {}): SceneGraph {
  validateGrid(grid);
  return { version: 1, grids: [grid], metadata };
}

export function countMaterials(grid: BlockGrid): Map<string, number> {
  validateGrid(grid);
  const counts = new Map<string, number>();
  for (const cell of grid.cells) counts.set(cell.block.id, (counts.get(cell.block.id) ?? 0) + 1);
  return counts;
}

export function createGrid(cells: BlockGrid['cells'], dimensions: Pick<BlockGrid, 'width' | 'height' | 'length'>, source: BlockGrid['cells'][number]['source'] = 'user'): BlockGrid {
  const palette = new Map<string, BlockState>([[AIR, { id: AIR }]]);
  const normalizedCells = cells.map((cell) => {
    const block = normalizeState(cell.block);
    palette.set(block.id, block);
    return { ...cell, block, source };
  });
  const grid: BlockGrid = { version: 1, ...dimensions, cells: normalizedCells, palette: [...palette.values()], coordinateSystem: 'xyz', origin: { x: 0, y: 0, z: 0 } };
  return validateGrid(grid);
}
