import type { BlockGrid, BlockState } from './types.js';
import { blockStateKey, normalizeState, validateGrid } from './grid.js';

export type GridEdit = { type: 'replace' | 'remove' | 'fill'; from?: BlockState; to?: BlockState; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

export function applyGridEdit(grid: BlockGrid, edit: GridEdit): BlockGrid {
  validateGrid(grid);
  if (!edit || !['replace', 'remove', 'fill'].includes(edit.type)) throw new Error('Unknown grid edit type.');
  if (!edit.min || !edit.max) throw new Error('Grid edits require minimum and maximum coordinates.');
  const limits = { x: grid.width, y: grid.height, z: grid.length };
  for (const axis of ['x', 'y', 'z'] as const) {
    for (const point of [edit.min, edit.max]) {
      if (!Number.isSafeInteger(point[axis]) || point[axis] < 0 || point[axis] >= limits[axis]) throw new Error('Grid edit coordinates are outside the grid dimensions.');
    }
  }
  const min = { x: Math.min(edit.min.x, edit.max.x), y: Math.min(edit.min.y, edit.max.y), z: Math.min(edit.min.z, edit.max.z) };
  const max = { x: Math.max(edit.min.x, edit.max.x), y: Math.max(edit.min.y, edit.max.y), z: Math.max(edit.min.z, edit.max.z) };
  if (edit.type === 'replace' && (!edit.from || !edit.to)) throw new Error('Replace edits require from and to block states.');
  if (edit.type === 'fill' && !edit.to) throw new Error('Fill edits require a target block state.');
  const target = edit.to ? normalizeState(edit.to) : undefined;
  const from = edit.from ? blockStateKey(edit.from) : undefined;
  const next = structuredClone(grid);
  if (edit.type === 'replace') {
    for (const cell of next.cells) if (inBox(cell, min, max) && blockStateKey(cell.block) === from) cell.block = structuredClone(target!);
  }
  if (edit.type === 'remove') next.cells = next.cells.filter((cell) => !inBox(cell, min, max));
  if (edit.type === 'fill') {
    const cells = new Map(next.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell]));
    for (let y = min.y; y <= max.y; y += 1) for (let z = min.z; z <= max.z; z += 1) for (let x = min.x; x <= max.x; x += 1) {
      const key = `${x},${y},${z}`;
      const previous = cells.get(key);
      cells.set(key, { x, y, z, block: structuredClone(target!), source: previous?.source ?? 'user' });
    }
    next.cells = [...cells.values()];
  }
  const palette = new Map<string, BlockState>([['minecraft:air', { id: 'minecraft:air' }]]);
  for (const cell of next.cells) palette.set(blockStateKey(cell.block), cell.block);
  next.palette = [...palette.values()];
  return validateGrid(next);
}

export class GridHistory {
  private past: BlockGrid[] = [];
  private future: BlockGrid[] = [];
  constructor(private current: BlockGrid) { validateGrid(current); }
  get value() { return this.current; }
  apply(edit: GridEdit) { const next = applyGridEdit(this.current, edit); this.past.push(this.current); this.current = next; this.future = []; return this.current; }
  undo() { const previous = this.past.pop(); if (!previous) return this.current; this.future.push(this.current); this.current = previous; return this.current; }
  redo() { const next = this.future.pop(); if (!next) return this.current; this.past.push(this.current); this.current = next; return this.current; }
}
function inBox(cell: { x: number; y: number; z: number }, min: GridEdit['min'], max: GridEdit['max']) { return cell.x >= min.x && cell.x <= max.x && cell.y >= min.y && cell.y <= max.y && cell.z >= min.z && cell.z <= max.z; }
