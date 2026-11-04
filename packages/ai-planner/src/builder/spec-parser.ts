import { BUILDER_ALLOWED_BLOCKS, type BuilderSpec } from './spec.js';

export type BuildSpecParseError = { reason: 'missing-code'; message: string };

export type BuildSpecParseResult = { ok: true; spec: BuilderSpec } | { ok: false; error: BuildSpecParseError };

const tagPattern = (tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
const FENCE = /```([a-z0-9_+.-]*)[ \t]*\r?\n([\s\S]*?)```/m;
const QUOTED = /['"`]\s*([a-z0-9_]+)\s*['"`]/gi;
const OPEN_FENCE = /^```[a-z0-9_+.-]*[ \t]*\r?\n/im;
const CLOSE_FENCE = /```\s*$/;

/** A build script is JavaScript when it opens the canonical entry function. */
export const JAVASCRIPT_BUILD_ENTRY = /(?:function\s+buildCreation\s*\(|\bbuildCreation\s*=\s*(?:function|\([^)]*\)\s*=>|async))/;

/**
 * Multi-language builds (some models answer C++, Lua or C#) are told to put
 * their block lookup in an array named like minecraftBlocks. When that name is
 * present, those quoted literals are catalog queries too, even if the script
 * itself is not runnable JavaScript.
 */
export const MULTI_LANGUAGE_QUERY = /minecraft[A-Z][A-Za-z0-9_]*Blocks/;

const readTag = (text: string, tag: string) => tagPattern(tag).exec(text)?.[1]?.trim();

export type BuilderSupportCode = { supportCode: string; language: string };

/**
 * The reply is JavaScript when buildCreation is written as a JS function or
 * arrow. A foreign-language answer (Lua, C#, C++) only counts when it names a
 * minecraft*Blocks table, which is where those languages keep the block list.
 */
export function perceiveSupportCode(text: string): BuilderSupportCode | undefined {
  const fence = FENCE.exec(text);
  const language = fence?.[1]?.trim().toLowerCase() || 'code';
  const body = fence ? fence[2].trim() : text.trim();
  if (body.length === 0) return undefined;
  if (JAVASCRIPT_BUILD_ENTRY.test(body)) return { supportCode: body, language };
  if (MULTI_LANGUAGE_QUERY.test(body)) return { supportCode: body, language };
  return undefined;
}

/**
 * Accepts the tagged BuilderGPT reply, a bare fenced block or a plain
 * `function buildCreation` snippet, and returns the first that holds the build.
 */
export function extractBuilderCode(text: string): string | undefined {
  const tagged = /<code>([\s\S]*?)<\/code>/i.exec(text)?.[1];
  if (tagged !== undefined) return tagged.trim();
  const fenced = FENCE.exec(text)?.[2];
  if (fenced !== undefined) return fenced.trim();
  const trimmed = text.trim().replace(OPEN_FENCE, '').replace(CLOSE_FENCE, '').trim();
  return JAVASCRIPT_BUILD_ENTRY.test(trimmed) ? trimmed : undefined;
}

/**
 * Block IDs the model asked about through get_minecraft_blocks. Only quoted
 * literals count: a namespaced string such as `minecraft:stone` is how the code
 * writes an already-chosen block, not a catalog query key.
 */
export function discoverBuilderBlocks(code: string): string[] {
  const discovered = new Set<string>();
  const body = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  for (const match of body.matchAll(QUOTED)) discovered.add(match[1]);
  return [...discovered].filter((id) => BUILDER_ALLOWED_BLOCKS.has(id)).sort();
}

/**
 * Parses a BuilderGPT-style model reply into an executable detour. The code
 * runs later against a recorder inside a sandbox; this only extracts it.
 */
export function parseBuilderSpec(text: string): BuildSpecParseResult {
  const code = extractBuilderCode(text);
  if (code === undefined) {
    return { ok: false, error: { reason: 'missing-code', message: 'The reply has no buildCreation function. BuilderGPT expects it inside <code></code> tags.' } };
  }
  return {
    ok: true,
    spec: {
      code,
      inspiration: readTag(text, 'inspiration'),
      description: readTag(text, 'description'),
      planning: readTag(text, 'build_planning'),
      discoveredBlocks: discoverBuilderBlocks(code),
      multiLanguage: !JAVASCRIPT_BUILD_ENTRY.test(code) && MULTI_LANGUAGE_QUERY.test(code),
    },
  };
}
