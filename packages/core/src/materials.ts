import type { BlockGrid } from './types.js';
import { countMaterials, validateGrid } from './grid.js';

export type MaterialGap = { id: string; required: number; available: number; directMissing: number; substituteCoverage: number; missing: number; substitutes: string[] };
export type MaterialInventory = Record<string, number>;
export type MaterialRules = Record<string, string[]>;

export function analyzeMaterials(grid: BlockGrid, inventory: MaterialInventory = {}, rules: MaterialRules = {}): MaterialGap[] {
  validateGrid(grid); const remaining = { ...inventory };
  return [...countMaterials(grid)].map(([id, required]) => {
    const available = Math.max(0, remaining[id] ?? 0); remaining[id] = Math.max(0, available - required);
    const directMissing = Math.max(0, required - available); let substituteCoverage = 0; const substitutes: string[] = [];
    for (const candidate of rules[id] ?? []) { const candidateAvailable = Math.max(0, remaining[candidate] ?? inventory[candidate] ?? 0); if (candidateAvailable > 0) { substitutes.push(candidate); const used = Math.min(candidateAvailable, directMissing - substituteCoverage); substituteCoverage += used; remaining[candidate] = Math.max(0, candidateAvailable - used); } }
    return { id, required, available, directMissing, substituteCoverage, missing: Math.max(0, directMissing - substituteCoverage), substitutes };
  }).sort((a, b) => b.missing - a.missing || b.required - a.required || a.id.localeCompare(b.id));
}
