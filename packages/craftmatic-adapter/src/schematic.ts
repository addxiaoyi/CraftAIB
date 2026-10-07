import type { BlockGrid, BlockState } from '@craftaib/core';
import { validateGrid } from '@craftaib/core';
import type { SchematicLike } from './index.js';

export async function serializeSchematic(grid: BlockGrid): Promise<Uint8Array> {
  validateGrid(grid);
  const schematic = toSchematicLike(grid);
  const palette = new Map<string, number>([['minecraft:air', 0]]);
  for (const state of schematic.palette) if (!palette.has(state)) palette.set(state, palette.size);
  const blockData: number[] = [];
  for (let y = 0; y < grid.height; y += 1) for (let z = 0; z < grid.length; z += 1) for (let x = 0; x < grid.width; x += 1) {
    const cell = grid.cells.find((candidate) => candidate.x === x && candidate.y === y && candidate.z === z);
    blockData.push(...encodeVarint(cell ? palette.get(cell.block.id) ?? 0 : 0));
  }
  const writer = new Writer();
  writer.tag(10, 'Schematic');
  writer.intTag('Version', 2); writer.intTag('DataVersion', 3700); writer.shortTag('Width', grid.width); writer.shortTag('Height', grid.height); writer.shortTag('Length', grid.length);
  writer.tag(11, 'Offset'); writer.int(3); writer.int(0); writer.int(0); writer.int(0);
  writer.intTag('PaletteMax', palette.size); writer.tag(10, 'Palette'); for (const [state, index] of palette) writer.intTag(state, index); writer.end(); writer.byteArrayTag('BlockData', blockData); writer.end();
  return gzip(writer.finish());
}

export function toSchematicLike(grid: BlockGrid): SchematicLike {
  validateGrid(grid);
  const states = new Map<string, string>();
  for (const cell of grid.cells) states.set(cell.block.id, formatState(cell.block));
  const palette = ['minecraft:air', ...new Set([...states.values()])];
  return { width: grid.width, height: grid.height, length: grid.length, palette, cells: grid.cells.map((cell) => ({ x: cell.x, y: cell.y, z: cell.z, state: palette.indexOf(states.get(cell.block.id) ?? 'minecraft:air') })) };
}

function formatState(state: BlockState) { const properties = Object.entries(state.properties ?? {}); return properties.length ? `${state.id}[${properties.map(([key, value]) => `${key}=${value}`).join(',')}]` : state.id; }
function encodeVarint(value: number) { const bytes = []; do { let next = value & 127; value >>>= 7; if (value) next |= 128; bytes.push(next); } while (value); return bytes; }
class Writer { bytes: number[] = []; byte(value: number) { this.bytes.push(value & 255); } short(value: number) { this.byte(value >> 8); this.byte(value); } int(value: number) { this.byte(value >> 24); this.byte(value >> 16); this.byte(value >> 8); this.byte(value); } string(value: string) { const bytes = new TextEncoder().encode(value); this.short(bytes.length); bytes.forEach((item) => this.byte(item)); } tag(type: number, name: string) { this.byte(type); this.string(name); } intTag(name: string, value: number) { this.tag(3, name); this.int(value); } shortTag(name: string, value: number) { this.tag(2, name); this.short(value); } byteArrayTag(name: string, values: number[]) { this.tag(7, name); this.int(values.length); values.forEach((item) => this.byte(item)); } end() { this.byte(0); } finish() { return new Uint8Array(this.bytes); } }
async function gzip(bytes: Uint8Array) { if (typeof CompressionStream === 'undefined') throw new Error('CompressionStream is required to serialize Schematic.'); return new Uint8Array(await new Response(new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); }
