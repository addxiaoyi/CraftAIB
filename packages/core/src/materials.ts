import type { BlockGrid } from './types.js';
import { countMaterials, validateGrid } from './grid.js';

export type MaterialGap = { id: string; required: number; available: number; missing: number; substitutes: string[] };
export type MaterialInventory = Record<string, number>;
export type MaterialRules = Record<string, string[]>;

export function analyzeMaterials(grid: BlockGrid, inventory: MaterialInventory = {}, rules: MaterialRules = {}): MaterialGap[] {
  validateGrid(grid);
  return [...countMaterials(grid)].map(([id, required]) => {
    const available = Math.max(0, inventory[id] ?? 0);
    const missing = Math.max(0, required - available);
    const substitutes = missing > 0 ? (rules[id] ?? []).filter((candidate) => (inventory[candidate] ?? 0) > 0) : [];
    return { id, required, available, missing, substitutes };
  }).sort((a, b) => b.missing - a.missing || b.required - a.required || a.id.localeCompare(b.id));
}
