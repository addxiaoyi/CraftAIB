import { createGrid, type BlockGrid } from '@craftaib/core';
import { runBuilderScript, type BuilderScriptRun, type RunBuilderScriptOptions } from './script-runner.js';
import { recorderToVoxelMask, voxelMaskToGrid } from './voxelize.js';

export type BuilderExecutionOptions = {
  maxBlocks?: number;
  maxFillVolume?: number;
  maxCoordinate?: number;
  evaluate?: RunBuilderScriptOptions['evaluate'];
};

export type BuilderExecution = BuilderScriptRun & {
  /** Grid built from the script's final world state, zero-based. */
  grid?: BlockGrid;
  /** Non-fatal notes, e.g. the multi-language compatibility path. */
  warnings: string[];
};

const MCS_FUNCTION = /function\s+buildCreation\s*\([\s\S]*?\)\s*\{([\s\S]*?)\}\s*$/;

/**
 * Runs a BuilderGPT buildCreation script the way its component does: execute the
 * JavaScript, collect the placements, then hand the result to the schematic and
 * command writers. The script is model output, so the result is returned rather
 * than thrown and is always inspectable, even when it failed midway.
 */
export function executeBuilderScript(code: string, options: BuilderExecutionOptions = {}): BuilderExecution {
  let source = code;
  const warnings: string[] = [];
  const body = MCS_FUNCTION.exec(code);
  if (body) {
    // Legacy replies can use a non-JavaScript signature around an otherwise valid body.
    try {
      // eslint-disable-next-line no-new-func
      new Function(code);
    } catch {
      source = `function buildCreation(startX, startY, startZ) {\n${body[1]}\n}`;
      warnings.push('Replayed the metric script body because its original signature is not valid JavaScript in this runtime.');
    }
  }
  const run = runBuilderScript(source, options);
  if (!run.recorder.writes.length) return { ...run, warnings };
  const mask = recorderToVoxelMask(run.recorder);
  return { ...run, grid: voxelMaskToGrid(mask), warnings };
}

export { createGrid };
