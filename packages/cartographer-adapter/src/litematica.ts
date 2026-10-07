import type { BlockGrid } from '@craftaib/core';

export type LitematicaSchema = {
  name: string;
  value: Record<string, unknown>;
};

export type LitematicaOptions = { name?: string; author?: string; description?: string };

export function generateLitematicaSchema(grid: BlockGrid, options: LitematicaOptions = {}): LitematicaSchema {
  if (!grid.cells.length) throw new Error('Cannot generate Litematica from an empty grid.');
  const palette = [{ Name: { type: 'string', value: 'minecraft:air' } }];
  const paletteIndex = new Map<string, number>([['minecraft:air', 0]]);
  for (const cell of grid.cells) {
    const key = stateKey(cell.block.id, cell.block.properties);
    if (paletteIndex.has(key)) continue;
    paletteIndex.set(key, palette.length);
    palette.push({ Name: { type: 'string', value: cell.block.id }, ...(cell.block.properties ? { Properties: { type: 'compound', value: Object.fromEntries(Object.entries(cell.block.properties).map(([name, value]) => [name, { type: 'string', value }])) } } : {}) });
  }
  const states = new Array(grid.width * grid.height * grid.length).fill(0);
  for (const cell of grid.cells) states[(cell.y * grid.length + cell.z) * grid.width + cell.x] = paletteIndex.get(stateKey(cell.block.id, cell.block.properties)) ?? 0;
  const bits = Math.max(2, Math.ceil(Math.log2(palette.length)));
  const words = encodeLongArray(states, bits);
  return { name: '', value: { MinecraftDataVersion: intTag(2584), Version: intTag(5), Metadata: compound({ TimeCreated: longTag([0, 0]), TimeModified: longTag([0, 0]), EnclosingSize: compound({ x: intTag(grid.width), y: intTag(grid.height), z: intTag(grid.length) }), Description: stringTag(options.description ?? ''), RegionCount: intTag(1), TotalBlocks: intTag(grid.cells.length), Author: stringTag(options.author ?? ''), TotalVolume: intTag(grid.width * grid.height * grid.length), Name: stringTag(options.name ?? '') }), Regions: compound({ map: compound({ BlockStates: { type: 'longArray', value: words }, BlockStatePalette: { type: 'list', value: { type: 'compound', value: palette } }, Position: compound({ x: intTag(0), y: intTag(0), z: intTag(0) }), Size: compound({ x: intTag(grid.width), y: intTag(grid.height), z: intTag(grid.length) }), PendingBlockTicks: emptyList(), PendingFluidTicks: emptyList(), TileEntities: emptyList(), Entities: emptyList() }) }) } };
}

function stateKey(id: string, properties?: Record<string, string>) { return `${id}|${Object.entries(properties ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(';')}`; }
function encodeLongArray(states: number[], bits: number): bigint[] { const perWord = Math.floor(64 / bits); const words = Array.from({ length: Math.ceil(states.length / perWord) }, () => 0n); states.forEach((state, index) => { const bit = BigInt((index % perWord) * bits); words[Math.floor(index / perWord)] |= BigInt(state) << bit; }); return words; }
const intTag = (value: number) => ({ type: 'int', value });
const stringTag = (value: string) => ({ type: 'string', value });
const longTag = (value: [number, number]) => ({ type: 'long', value });
const compound = (value: Record<string, unknown>) => ({ type: 'compound', value });
const emptyList = () => ({ type: 'list', value: { type: 'end', value: [] } });
