import { AIR_BLOCK, normalizeBuilderBlock, type BuilderBlockOption, type ParsedBlock } from './spec.js';

export type RecorderLimits = { maxBlocks?: number; maxCoordinate?: number };

export type BlockWrite = {
  x: number;
  y: number;
  z: number;
  block: ParsedBlock;
  mode: string | undefined;
  /** Index of the fill box this write belongs to (-1 for a setBlock). */
  box: number;
};

export type BuilderOperationHandlers = {
  fill(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string, options?: BuilderBlockOption): void;
  setBlock(x: number, y: number, z: number, block: string, options?: BuilderBlockOption): void;
  fillBiome(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, biome: string): void;
};

/**
 * Ordered, unflattened record of safeSetBlock / safeFill / safeFillBiome calls.
 * Executing the calls later with an ordered world reproduces vanilla /fill
 * corner order, which is what BuilderGPT's mcschematic backend applies.
 */
export type BuilderRecorder = {
  writes: BlockWrite[];
  biomeWrites: Array<{ x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; biome: string }>;
  boxes: number;
  /** Writes dropped for a bad coordinate, unknown block or exceeded budget. */
  invalidWrites: number;
  invalidBlocks: string[];
  operations: BuilderOperationHandlers;
};

const toInt = (value: number) => Math.trunc(Number(value));

type FillOptions = {
  mode: string | undefined;
  blockStates: Record<string, string> | undefined;
  replaceFilter: string | undefined;
  replaceFilterStates: Record<string, string> | undefined;
};

const toStringMap = (value: unknown): Record<string, string> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry)]))
    : undefined;

/** Decodes the bare string and the documented object form into one shape. */
export function readFillOptions(options: BuilderBlockOption | object | undefined): FillOptions {
  if (typeof options === 'string') return { mode: options, blockStates: undefined, replaceFilter: undefined, replaceFilterStates: undefined };
  if (!options || typeof options !== 'object') return { mode: undefined, blockStates: undefined, replaceFilter: undefined, replaceFilterStates: undefined };
  const raw = options as { mode?: unknown; blockStates?: unknown; replaceFilter?: unknown; replaceFilterStates?: unknown };
  return {
    mode: typeof raw.mode === 'string' ? raw.mode : undefined,
    blockStates: toStringMap(raw.blockStates),
    replaceFilter: typeof raw.replaceFilter === 'string' ? raw.replaceFilter : undefined,
    replaceFilterStates: toStringMap(raw.replaceFilterStates),
  };
}

/** `stone` and `minecraft:stone` name the same block; states are ignored for matching. */
function blockIdOf(value: string | null | undefined): string {
  if (!value) return AIR_BLOCK;
  const base = value.split('[', 1)[0];
  return base.includes(':') ? base : `minecraft:${base}`;
}

/**
 * Records calls instead of mutating a world. Invalid coordinates and out-of-catalog
 * writes are counted; exceeding the block budget
 * throws so the caller can stop execution. A later write replaces an
 * earlier one at the same position (mcschematic `setBlock` semantics), except
 * under mode `keep`, which never overwrites a placed block.
 */
export function createBuilderRecorder(limits: RecorderLimits = {}): BuilderRecorder {
  const maxBlocks = Math.max(1, Math.floor(limits.maxBlocks ?? 4_000_000));
  const maxCoordinate = Math.max(1, Math.floor(limits.maxCoordinate ?? 4096));
  const recorder: BuilderRecorder = { writes: [], biomeWrites: [], boxes: 0, invalidWrites: 0, invalidBlocks: [], operations: undefined as never };
  const world = new Map<string, string>();

  const inRange = (x: number, y: number, z: number) => Math.abs(x) <= maxCoordinate && Math.abs(y) <= maxCoordinate && Math.abs(z) <= maxCoordinate;

  const record = (x: number, y: number, z: number, block: ParsedBlock, mode: string | undefined, box: number, replaceFilter: string | undefined) => {
    const position = `${toInt(x)},${toInt(y)},${toInt(z)}`;
    if (block === null || block.id === AIR_BLOCK) {
      if (mode === 'replace' && world.has(position)) {
        if (replaceFilter !== undefined && blockIdOf(world.get(position)) !== replaceFilter) return;
        recorder.writes.push({ x: toInt(x), y: toInt(y), z: toInt(z), block: null, mode, box });
        world.delete(position);
      }
      return;
    }
    if (mode === 'keep' && world.has(position)) return;
    if (mode === 'replace' && replaceFilter !== undefined && blockIdOf(world.get(position)) !== replaceFilter) return;
    if (recorder.writes.length >= maxBlocks) { recorder.invalidWrites += 1; throw new Error('builder block budget exceeded'); }
    recorder.writes.push({ x: toInt(x), y: toInt(y), z: toInt(z), block, mode, box });
    world.set(position, block.id);
  };

  /** Merges inline `block[key=value]` states with options.blockStates; options win, both sorted. */
  const withStates = (parsed: ParsedBlock, options: BuilderBlockOption | object | undefined): ParsedBlock => {
    if (!parsed) return parsed;
    const optionStates = readFillOptions(options).blockStates;
    const merged = { ...parsed.properties, ...optionStates };
    const names = Object.keys(merged).sort();
    return names.length ? { id: parsed.id, properties: Object.fromEntries(names.map((name) => [name, merged[name]])) } : { id: parsed.id };
  };

  recorder.operations = {
    fill: (x1, y1, z1, x2, y2, z2, block, options) => {
      const parsed = withStates(normalizeBuilderBlock(block), options);
      if (!parsed) { recorder.invalidWrites += 1; recorder.invalidBlocks.push(String(block)); return; }
      if (![x1, y1, z1, x2, y2, z2].every(Number.isFinite) || ![x1, y1, z1, x2, y2, z2].every((v) => Math.abs(v) <= maxCoordinate)) { recorder.invalidWrites += 1; return; }
      const box = recorder.boxes;
      recorder.boxes += 1;
      const { mode, replaceFilter } = readFillOptions(options);
      // Upstream: a filtered replace with no filter is a replace of air.
      const filter = mode === 'replace' && replaceFilter === undefined ? AIR_BLOCK : replaceFilter === undefined ? undefined : blockIdOf(replaceFilter);
      const minX = Math.min(toInt(x1), toInt(x2)); const maxX = Math.max(toInt(x1), toInt(x2));
      const minY = Math.min(toInt(y1), toInt(y2)); const maxY = Math.max(toInt(y1), toInt(y2));
      const minZ = Math.min(toInt(z1), toInt(z2)); const maxZ = Math.max(toInt(z1), toInt(z2));
      const shell = mode === 'hollow' || mode === 'outline';
      for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) for (let z = minZ; z <= maxZ; z += 1) {
        if (shell && x !== minX && x !== maxX && y !== minY && y !== maxY && z !== minZ && z !== maxZ) continue;
        record(x, y, z, parsed, mode, box, filter);
      }
    },
    setBlock: (x, y, z, block, options) => {
      const parsed = withStates(normalizeBuilderBlock(block), options);
      if (!parsed) { recorder.invalidWrites += 1; recorder.invalidBlocks.push(String(block)); return; }
      if (![x, y, z].every(Number.isFinite) || !inRange(x, y, z)) { recorder.invalidWrites += 1; return; }
      record(x, y, z, parsed, readFillOptions(options).mode, -1, undefined);
    },
    fillBiome: (x1, y1, z1, x2, y2, z2, biome) => {
      if (![x1, y1, z1, x2, y2, z2].every(Number.isFinite)) return;
      recorder.biomeWrites.push({ x1, y1, z1, x2, y2, z2, biome: String(biome) });
    },
  };
  return recorder;
}
