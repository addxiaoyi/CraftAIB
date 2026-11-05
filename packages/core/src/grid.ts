import type { BlockGrid, BlockState, SceneGraph } from './types.js';

const AIR = 'minecraft:air';

export function validateGrid(grid: BlockGrid): BlockGrid {
  if (!grid || typeof grid !== 'object') throw new Error('BlockGrid must be an object.');
  if (grid.version !== 1 || grid.coordinateSystem !== 'xyz') throw new Error('Unsupported BlockGrid version or coordinate system.');
  for (const size of [grid.width, grid.height, grid.length]) {
    if (!Number.isSafeInteger(size) || size < 1) throw new Error('BlockGrid dimensions must be positive safe integers.');
  }
  if (!Number.isSafeInteger(grid.width * grid.height * grid.length)) throw new Error('BlockGrid volume exceeds the safe integer range.');
  if (!grid.origin || ![grid.origin.x, grid.origin.y, grid.origin.z].every(Number.isSafeInteger)) throw new Error('BlockGrid origin must contain safe integer coordinates.');
  if (!Array.isArray(grid.palette) || !Array.isArray(grid.cells)) throw new Error('BlockGrid palette and cells must be arrays.');
  const palette = new Set(grid.palette.map(blockStateKey));
  if (!palette.has(AIR)) throw new Error('BlockGrid palette must contain minecraft:air.');
  const seen = new Set<string>();
  for (const cell of grid.cells) {
    if (!cell || ![cell.x, cell.y, cell.z].every(Number.isSafeInteger)) throw new Error('BlockGrid coordinates must be safe integers.');
    if (cell.x < 0 || cell.x >= grid.width || cell.y < 0 || cell.y >= grid.height || cell.z < 0 || cell.z >= grid.length) throw new Error('BlockGrid cell is outside its dimensions.');
    const key = `${cell.x},${cell.y},${cell.z}`;
    if (seen.has(key)) throw new Error(`Duplicate BlockGrid cell at ${key}.`);
    seen.add(key);
    if (!palette.has(blockStateKey(cell.block))) throw new Error(`Block state ${blockStateKey(cell.block)} is missing from the palette.`);
  }
  return grid;
}

export function normalizeState(state: BlockState): BlockState {
  if (!state || typeof state.id !== 'string' || !/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(state.id)) throw new Error(`Invalid block state id: ${state?.id}`);
  if (state.properties !== undefined && (!state.properties || typeof state.properties !== 'object' || Array.isArray(state.properties))) throw new Error(`Invalid properties for block ${state.id}.`);
  const properties = Object.entries(state.properties ?? {}).sort(([left], [right]) => left.localeCompare(right));
  for (const [name, value] of properties) {
    if (!name || /[\s,=\[\]]/.test(name) || typeof value !== 'string' || !value || /[\s,=\[\]]/.test(value)) throw new Error(`Invalid property ${name} for block ${state.id}.`);
  }
  return { id: state.id.includes(':') ? state.id : `minecraft:${state.id}`, ...(properties.length ? { properties: Object.fromEntries(properties) } : {}) };
}

export function blockStateKey(state: BlockState): string {
  const normalized = normalizeState(state);
  const properties = Object.entries(normalized.properties ?? {});
  return properties.length ? `${normalized.id}[${properties.map(([name, value]) => `${name}=${value}`).join(',')}]` : normalized.id;
}

export function parseBlockState(text: string): BlockState {
  if (typeof text !== 'string') throw new Error('Block state must be a string.');
  const match = /^([^\[\]]+)(?:\[([^\[\]]+)\])?$/.exec(text);
  if (!match) throw new Error(`Invalid block state: ${text}`);
  const pairs = (match[2] ?? '').split(',').filter(Boolean).map((property) => {
    const parts = property.split('=');
    if (parts.length !== 2) throw new Error(`Invalid block property: ${property}`);
    return parts as [string, string];
  });
  if (new Set(pairs.map(([name]) => name)).size !== pairs.length) throw new Error(`Duplicate block property: ${text}`);
  return normalizeState({ id: match[1], ...(pairs.length ? { properties: Object.fromEntries(pairs) } : {}) });
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
  if (!Array.isArray(cells)) throw new Error('BlockGrid cells must be an array.');
  const palette = new Map<string, BlockState>([[AIR, { id: AIR }]]);
  const normalizedCells = cells.map((cell) => {
    const block = normalizeState(cell.block);
    palette.set(blockStateKey(block), block);
    return { ...cell, block, source };
  });
  const grid: BlockGrid = { version: 1, ...dimensions, cells: normalizedCells, palette: [...palette.values()], coordinateSystem: 'xyz', origin: { x: 0, y: 0, z: 0 } };
  return validateGrid(grid);
}
