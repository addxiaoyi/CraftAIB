import type { BlockGrid } from './types.js';
import { validateGrid } from './grid.js';

export type GridCheckpoint = { version: 1; savedAt: string; grid: BlockGrid };
export function serializeCheckpoint(grid: BlockGrid): string { validateGrid(grid); return JSON.stringify({ version: 1, savedAt: new Date().toISOString(), grid }, null, 2); }
export function parseCheckpoint(raw: string): BlockGrid { const checkpoint = JSON.parse(raw) as GridCheckpoint; if (checkpoint.version !== 1 || !checkpoint.grid) throw new Error('Invalid CraftAIB checkpoint.'); return validateGrid(checkpoint.grid); }
