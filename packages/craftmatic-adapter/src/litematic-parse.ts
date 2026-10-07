import { createGrid, type BlockGrid } from '@craftaib/core';
import { gunzip, Reader } from './parse.js';

export async function parseLitematicaBytes(input: Uint8Array): Promise<BlockGrid> {
  const root = new Reader(await gunzip(input)).tag().value;
  const region = root.Regions.value.map.value;
  const size = region.Size.value;
  const width = Math.abs(size.x.value); const height = Math.abs(size.y.value); const length = Math.abs(size.z.value);
  const palette = region.BlockStatePalette.value.value.map((entry: any) => entry.Name.value);
  const words = region.BlockStates.value;
  const bits = Math.max(2, Math.ceil(Math.log2(palette.length))); const perWord = Math.floor(64 / bits); const mask = (1n << BigInt(bits)) - 1n;
  const cells = [];
  for (let index = 0; index < width * height * length; index += 1) {
    const word = words[Math.floor(index / perWord)] ?? 0n; const state = Number((word >> BigInt((index % perWord) * bits)) & mask); const id = palette[state] ?? 'minecraft:air';
    if (id === 'minecraft:air') continue;
    const x = index % width; const z = Math.floor(index / width) % length; const y = Math.floor(index / (width * length));
    cells.push({ x, y, z, block: parseState(id), source: 'craftmatic' as const });
  }
  return createGrid(cells, { width, height, length }, 'craftmatic');
}
function parseState(value: string) { const match = value.match(/^([^[]+)(?:\[(.*)\])?$/); if (!match) return { id: value }; const properties = match[2] ? Object.fromEntries(match[2].split(',').map((item) => item.split('='))) : undefined; return { id: match[1], ...(properties ? { properties } : {}) }; }

