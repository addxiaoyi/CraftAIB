import { BUILDER_BLOCK_NAMES, BUILDERGPT_BLOCK_COUNT } from './block-catalog.js';

export type BuilderFillMode = 'replace' | 'keep' | 'destroy' | 'hollow' | 'outline';

/**
 * `safeFill(x1, y1, z1, x2, y2, z2, blockType, options)`. Upstream accepts either
 * a bare mode string or the documented object form; both carry the same fields.
 */
export type BuilderBlockOption =
  | BuilderFillMode
  | {
      mode?: BuilderFillMode | string;
      blockStates?: Record<string, string>;
      replaceFilter?: string;
      replaceFilterStates?: Record<string, string>;
    };

/**
 * The call interface a BuilderGPT-style model is told about. `fill` mirrors
 * `safeFill` (both corners inclusive), `setBlock` mirrors `safeSetBlock`.
 */
export type BuilderOperations = {
  fill(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string, options?: BuilderBlockOption): void;
  setBlock(x: number, y: number, z: number, block: string, options?: BuilderBlockOption): void;
  fillBiome(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, biome: string): void;
};

export type BuilderSpec = {
  code: string;
  inspiration?: string;
  description?: string;
  planning?: string;
  discoveredBlocks: string[];
  multiLanguage: boolean;
};

export type BuilderCell = { x: number; y: number; z: number; block: { id: string; properties?: Record<string, string> } };

export type ParsedBlock = { id: string; properties?: Record<string, string> } | null;

export const BUILDER_BLOCK_COUNT: number = BUILDERGPT_BLOCK_COUNT;
export const BUILDER_ALLOWED_BLOCKS: ReadonlySet<string> = new Set<string>(BUILDER_BLOCK_NAMES);

const BLOCK_PATTERN = /^[a-z0-9_.-]+(:[a-z0-9_./-]+)?$/;
export const AIR_BLOCK = 'minecraft:air';

/**
 * Restores the minecraft namespace, sorts block states for determinism, and
 * rejects anything outside the BuilderGPT catalog; this is the normalization its
 * Python bridge applies before a block reaches the schematic. Air is allowed
 * here as space-clearing, but the recorder never stores it as a build cell.
 */
export function normalizeBuilderBlock(block: string, allowed: ReadonlySet<string> = BUILDER_ALLOWED_BLOCKS): ParsedBlock {
  if (typeof block !== 'string' || !block.trim()) return null;
  const match = /^([^[]+)(?:\[(.*)\])?$/.exec(block.trim());
  if (!match) return null;
  const id = match[1].startsWith('minecraft:') ? match[1] : `minecraft:${match[1]}`;
  if (!BLOCK_PATTERN.test(id) || !allowed.has(id.slice('minecraft:'.length))) return null;
  const properties: Record<string, string> = {};
  for (const pair of (match[2] ?? '').split(',').filter(Boolean)) {
    const [key, value] = pair.split('=', 2);
    if (key?.trim() && value?.trim()) properties[key.trim()] = value.trim();
  }
  const names = Object.keys(properties).sort();
  return names.length ? { id, properties: Object.fromEntries(names.map((name) => [name, properties[name]])) } : { id };
}
