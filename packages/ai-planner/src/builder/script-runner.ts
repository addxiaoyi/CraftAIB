import { createBuilderRecorder, readFillOptions, type BuilderRecorder } from './recorder.js';
import { normalizeBuilderBlock } from './spec.js';
import type { BuilderBlockOption } from './spec.js';

/**
 * The command text carries the effective block: inline `block[key=value]` states
 * merged with `options.blockStates` (options win), matching what the recorder stores.
 */
function builderBlockText(block: string, options: BuilderBlockOption | object | undefined): string {
  const parsed = normalizeBuilderBlock(block);
  const written = String(block).trim().replace(/\[.*\]$/, '');
  if (!parsed) return String(block);
  const optionStates = readFillOptions(options).blockStates ?? {};
  const merged = { ...parsed.properties, ...optionStates };
  const names = Object.keys(merged).sort();
  return names.length ? `${written}[${names.map((name) => `${name}=${merged[name]}`).join(',')}]` : written;
}

/** Host capabilities a build script must not reach. */
const SHADOWED_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'window', 'document', 'localStorage', 'sessionStorage',
  'indexedDB', 'process', 'require', 'importScripts', 'postMessage', 'Worker', 'SharedWorker',
  'ServiceWorker', 'WebAssembly', 'Proxy', 'Reflect',
  'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'requestAnimationFrame',
] as const;

export type RunBuilderScriptOptions = {
  maxBlocks?: number;
  /** Vanilla /fill caps a box at 32,768 blocks; a larger fill is rejected, not clipped. */
  maxFillVolume?: number;
  maxCoordinate?: number;
  /** Required for untrusted scripts; the server supplies its bounded QuickJS evaluator. */
  evaluate?: (source: string, helpers: Record<string, (...args: any[]) => void>) => void;
};

export type BuildStep =
  | { kind: 'fill'; box: number; from: [number, number, number]; to: [number, number, number]; block: string; mode?: string }
  | { kind: 'set'; from: [number, number, number]; block: string; mode?: string }
  | { kind: 'biome'; from: [number, number, number]; to: [number, number, number]; biome: string }
  | { kind: 'invalid'; reason: string };

export type BuilderScriptRun = {
  recorder: BuilderRecorder;
  steps: BuildStep[];
  commands: string[];
  ok: boolean;
  error?: string;
};

const toInt = (value: number) => Math.trunc(Number(value));
const finiteTriple = (values: number[]) => values.length === 3 && values.every((value) => Number.isFinite(value));

function readMode(options: unknown): string | undefined {
  if (typeof options === 'string') return options;
  if (options && typeof options === 'object' && 'mode' in options) {
    const mode = (options as { mode?: unknown }).mode;
    return typeof mode === 'string' ? mode : undefined;
  }
  return undefined;
}

/**
 * Runs one build script and produces both the recorded writes and the exact
 * /setblock, /fill, /fillbiome command list BuilderGPT keeps alongside its
 * schematic, so the same build can be pasted or exported as .mcfunction.
 *
 * The direct Function path is for trusted local scripts only. Global shadowing
 * is not a sandbox; model replies must supply an isolated evaluator.
 */
export function runBuilderScript(code: string, options: RunBuilderScriptOptions = {}): BuilderScriptRun {
  const recorder = createBuilderRecorder({ maxBlocks: options.maxBlocks, maxCoordinate: options.maxCoordinate });
  const maxFillVolume = Math.max(1, Math.floor(options.maxFillVolume ?? 32_768));
  const steps: BuildStep[] = [];

  const fill = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string, options?: BuilderBlockOption) => {
    if (!finiteTriple([x1, y1, z1]) || !finiteTriple([x2, y2, z2])) { steps.push({ kind: 'invalid', reason: 'non-finite fill corner' }); return; }
    const [ax, ay, az] = [x1, y1, z1].map(toInt);
    const [bx, by, bz] = [x2, y2, z2].map(toInt);
    const volume = (Math.abs(bx - ax) + 1) * (Math.abs(by - ay) + 1) * (Math.abs(bz - az) + 1);
    if (volume > maxFillVolume) { steps.push({ kind: 'invalid', reason: `fill volume ${volume} exceeds ${maxFillVolume}` }); return; }
    const mode = readFillOptions(options).mode;
    recorder.operations.fill(ax, ay, az, bx, by, bz, block, options);
    steps.push({ kind: 'fill', box: recorder.boxes - 1, from: [ax, ay, az], to: [bx, by, bz], block: builderBlockText(block, options), mode });
  };
  const set = (x: number, y: number, z: number, block: string, options?: BuilderBlockOption) => {
    if (!finiteTriple([x, y, z])) { steps.push({ kind: 'invalid', reason: 'non-finite position' }); return; }
    const mode = readFillOptions(options).mode;
    recorder.operations.setBlock(x, y, z, block, options);
    steps.push({ kind: 'set', from: [x, y, z], block: builderBlockText(block, options), mode });
  };
  const biome = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, value: string) => {
    const [ax, ay, az] = [x1, y1, z1].map(toInt);
    const [bx, by, bz] = [x2, y2, z2].map(toInt);
    steps.push({ kind: 'biome', from: [ax, ay, az], to: [bx, by, bz], biome: String(value) });
    recorder.operations.fillBiome(ax, ay, az, bx, by, bz, String(value));
  };

  const shadow = SHADOWED_GLOBALS.map((name) => `var ${name};`).join(' ');
  const source = `"use strict";\n${shadow}\n${code}\n;return typeof buildCreation === "function" ? buildCreation(0, 0, 0) : undefined;`;
  const run: BuilderScriptRun = { recorder, steps, commands: [], ok: true };

  try {
    if (options.evaluate) options.evaluate(source, { safeSetBlock: set, safeFill: fill, safeFillBiome: biome });
    else {
      const factory = new Function('safeSetBlock', 'safeFill', 'safeFillBiome', source) as (s: typeof set, f: typeof fill, b: typeof biome) => unknown;
      factory(set, fill, biome);
    }
  } catch (error) {
    run.ok = false;
    const message = error instanceof Error ? error.message : String(error);
    run.error = /budget exceeded/.test(message) ? 'The build script placed more blocks than the budget allows.' : message;
  }
  if (run.ok && !steps.length) {
    run.ok = false;
    run.error = 'The script defined buildCreation but placed no blocks.';
  }
  run.commands = stepsToCommands(steps);
  return run;
}

export function stepsToCommands(steps: BuildStep[]): string[] {
  return steps.map((step) => {
    switch (step.kind) {
      case 'fill': return `fill ${step.from.join(' ')} ${step.to.join(' ')} ${step.block}${step.mode ? ` ${step.mode}` : ''}`;
      case 'set': return `setblock ${step.from.join(' ')} ${step.block}${step.mode ? ` ${step.mode}` : ''}`;
      case 'biome': return `fillbiome ${step.from.join(' ')} ${step.to.join(' ')} ${step.biome}`;
      case 'invalid': return `# rejected: ${step.reason}`;
    }
  });
}
