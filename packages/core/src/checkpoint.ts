import type { BlockGrid } from './types.js';
import { validateGrid } from './grid.js';
import { parseEngineJson, stringifyEngineJson } from './json.js';

export type GridCheckpoint = { version: 1; savedAt: string; grid: BlockGrid };
export function serializeCheckpoint(grid: BlockGrid): string { validateGrid(grid); return stringifyEngineJson({ version: 1, savedAt: new Date().toISOString(), grid }, 2); }
export function parseCheckpoint(raw: string): BlockGrid { const checkpoint = parseEngineJson(raw) as GridCheckpoint; if (!checkpoint || checkpoint.version !== 1 || !checkpoint.grid) throw new Error('Invalid CraftAIB checkpoint.'); return validateGrid(checkpoint.grid); }
