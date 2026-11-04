const PREVIEW_BLOCK_ALIASES: Record<string, string> = {
  grass: 'short_grass',
};

export function resolvePreviewBlockId(blockId: string): string {
  const prefix = 'minecraft:';
  const hasPrefix = blockId.startsWith(prefix);
  const name = hasPrefix ? blockId.slice(prefix.length) : blockId;
  const alias = PREVIEW_BLOCK_ALIASES[name];
  if (!alias) return blockId;
  return hasPrefix ? `${prefix}${alias}` : alias;
}
