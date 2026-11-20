import type { BlockGrid } from '@craftaib/core';
import type { BuilderExecution, BuilderExecutionOptions } from './execute.js';
import { executeBuilderScript } from './execute.js';
import { createBuilderRecorder } from './recorder.js';
import { createBuilderSystemPrompt } from './prompt.js';
import type { BuilderSpec } from './spec.js';
import { parseBuilderSpec } from './spec-parser.js';

export type BuilderMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type BuilderModelReply = { text: string };

/**
 * Any callable that turns a chat into model text. The caller owns the
 * network call; this module only owns the BuilderGPT contract
 * (prompt in, tagged reply out).
 */
export type BuilderModelTransport = (messages: BuilderMessage[]) => Promise<BuilderModelReply>;

export type BuilderBuildRequest = {
  /** The user's build description, e.g. "a small oak watchtower". */
  description: string;
  seed?: number;
  model?: string;
  referenceImage?: { width: number; height: number; pixels?: Uint8Array | number[]; dataUrl?: string };
};

export type BuilderBuildOptions = {
  maxBlocks?: number;
  maxFillVolume?: number;
  maxCoordinate?: number;
  evaluate?: BuilderExecutionOptions['evaluate'];
  /** Overrides the parsed reply; handy for goldens and the UI's editor mode. */
  code?: string;
  /** Skip execution and return the parsed spec only. */
  dryRun?: boolean;
};

export type BuilderBuildResult = BuilderExecution & {
  /** The reply's own description, if it has one; otherwise the request's. */
  name: string;
  reply?: string;
  spec?: BuilderSpec;
};

/** The system message BuilderGPT sends ahead of every build request. */
export function builderMessages(request: BuilderBuildRequest): BuilderMessage[] {
  return [
    { role: 'system', content: createBuilderSystemPrompt({ description: request.description }) },
    { role: 'user', content: request.description },
  ];
}

/**
 * Runs one model reply end to end. A reply without <code> returns ok=false
 * instead of throwing, because a model that ignored the format is a normal
 * failure mode, not a crash.
 */
export function builderFromReply(reply: string, options: BuilderBuildOptions = {}): BuilderBuildResult {
  const parsed = options.code !== undefined
    ? { ok: true as const, spec: { code: options.code, discoveredBlocks: [], multiLanguage: false } }
    : parseBuilderSpec(reply);
  const name = parsed.ok ? (parsed.spec.description ?? parsed.spec.inspiration ?? 'Generated build') : 'Generated build';
  const empty = createBuilderRecorder({ maxBlocks: 1 });
  if (!parsed.ok) {
    return { recorder: empty, steps: [], commands: [], ok: false, error: parsed.error.message, warnings: [parsed.error.message], name, reply };
  }
  if (options.dryRun) {
    return { recorder: empty, steps: [], commands: [], ok: true, warnings: [], name, reply, spec: parsed.spec };
  }
  const execution = executeBuilderScript(parsed.spec.code, options);
  if (parsed.spec.multiLanguage) {
    execution.warnings.push("The reply's code is not JavaScript; block names were read from its minecraft*Blocks table.");
  }
  return { ...execution, name, reply, spec: parsed.spec };
}

/**
 * Sends the BuilderGPT build request through the caller's transport and
 * returns the executed build. Exporting is left to the caller (grid goes to
 * serializeSchematic, commands to a .mcfunction join).
 */
export async function builderRequest(
  request: BuilderBuildRequest,
  transport: BuilderModelTransport,
  options: BuilderBuildOptions = {},
): Promise<BuilderBuildResult> {
  const reply = await transport(builderMessages(request));
  return builderFromReply(reply.text, options);
}

export type { BlockGrid };
