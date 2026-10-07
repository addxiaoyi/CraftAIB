import type { BlockGrid, BlockState } from './types.js';
import { validateGrid } from './grid.js';

export type GridEdit = { type: 'replace' | 'remove' | 'fill'; from?: BlockState; to?: BlockState; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

export function applyGridEdit(grid: BlockGrid, edit: GridEdit): BlockGrid {
  validateGrid(grid); const next = structuredClone(grid);
  const min = { x: Math.min(edit.min.x, edit.max.x), y: Math.min(edit.min.y, edit.max.y), z: Math.min(edit.min.z, edit.max.z) }; const max = { x: Math.max(edit.min.x, edit.max.x), y: Math.max(edit.min.y, edit.max.y), z: Math.max(edit.min.z, edit.max.z) };
  if (edit.type === 'replace') { if (!edit.from || !edit.to) throw new Error('Replace edits require from and to block states.'); for (const cell of next.cells) if (inBox(cell, min, max) && sameState(cell.block, edit.from)) cell.block = { ...edit.to }; }
  if (edit.type === 'remove') next.cells = next.cells.filter((cell) => !inBox(cell, min, max));
  if (edit.type === 'fill') { if (!edit.to) throw new Error('Fill edits require a target block state.'); for (let y = min.y; y <= max.y; y += 1) for (let z = min.z; z <= max.z; z += 1) for (let x = min.x; x <= max.x; x += 1) { const cell = next.cells.find((candidate) => candidate.x === x && candidate.y === y && candidate.z === z); if (cell) cell.block = { ...edit.to }; else next.cells.push({ x, y, z, block: { ...edit.to }, source: 'user' }); } }
  next.palette = [{ id: 'minecraft:air' }, ...unique(next.cells.map((cell) => cell.block))];
  return validateGrid(next);
}

export class GridHistory {
  private past: BlockGrid[] = [];
  private future: BlockGrid[] = [];
  constructor(private current: BlockGrid) { validateGrid(current); }
  get value() { return this.current; }
  apply(edit: GridEdit) { this.past.push(this.current); this.current = applyGridEdit(this.current, edit); this.future = []; return this.current; }
  undo() { const previous = this.past.pop(); if (!previous) return this.current; this.future.push(this.current); this.current = previous; return this.current; }
  redo() { const next = this.future.pop(); if (!next) return this.current; this.past.push(this.current); this.current = next; return this.current; }
}
function inBox(cell: { x: number; y: number; z: number }, min: GridEdit['min'], max: GridEdit['max']) { return cell.x >= min.x && cell.x <= max.x && cell.y >= min.y && cell.y <= max.y && cell.z >= min.z && cell.z <= max.z; }
function sameState(a: BlockState, b: BlockState) { return a.id === b.id && JSON.stringify(a.properties ?? {}) === JSON.stringify(b.properties ?? {}); }
function unique(states: BlockState[]) { const seen = new Set<string>(); return states.filter((state) => { const key = `${state.id}|${JSON.stringify(state.properties ?? {})}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
