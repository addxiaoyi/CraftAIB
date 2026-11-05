import type { BlockGrid } from '@craftaib/core';
import { normalizeState, validateGrid } from '@craftaib/core';

export type LitematicaSchema = { name: string; value: Record<string, any> };
export type LitematicaVec3 = { x: number; y: number; z: number };
export type LitematicaRegionInput = { name: string; grid: BlockGrid; position?: LitematicaVec3; size?: LitematicaVec3; dataVersion?: number };
export type LitematicaOptions = { name?: string; author?: string; description?: string; version?: number; minecraftDataVersion?: number; originalOrigin?: LitematicaVec3; regions?: LitematicaRegionInput[] };

export function generateLitematicaSchema(grid: BlockGrid, options: LitematicaOptions = {}): LitematicaSchema {
  validateGrid(grid);
  if (!grid.cells.length && !options.regions?.length) throw new Error('Cannot generate Litematica from an empty grid.');
  const regions = options.regions?.length ? options.regions : [{ name: 'CraftAIB', grid, position: grid.origin }];
  return generateLitematicaDocumentSchema(regions, { originalOrigin: grid.origin, ...options });
}

export function generateLitematicaDocumentSchema(regions: LitematicaRegionInput[], options: LitematicaOptions = {}): LitematicaSchema {
  if (!Array.isArray(regions) || !regions.length) throw new Error('Cannot generate Litematica without regions.');
  const names = new Set<string>();
  const regionTags = Object.fromEntries(regions.map((region, index) => {
    const name = region.name || `Region_${index + 1}`;
    if (names.has(name)) throw new Error(`Duplicate Litematic region name: ${name}.`);
    names.add(name);
    return [name, compound(createRegionTag(region, region.dataVersion ?? options.minecraftDataVersion ?? 2584))];
  }));
  const totalBlocks = regions.reduce((total, region) => total + region.grid.cells.filter((cell) => normalizeState(cell.block).id !== 'minecraft:air').length, 0);
  const totalVolume = regions.reduce((total, region) => total + absoluteVolume(region.size ?? dimensions(region.grid)), 0);
  const enclosingSize = getEnclosingSize(regions);
  const metadata = compound({
    TimeCreated: longTag([0, 0]),
    TimeModified: longTag([0, 0]),
    EnclosingSize: vecTag(enclosingSize),
    Description: stringTag(options.description ?? ''),
    RegionCount: intTag(regions.length),
    TotalBlocks: longNumberTag(totalBlocks),
    TotalVolume: longNumberTag(totalVolume),
    Author: stringTag(options.author ?? ''),
    Name: stringTag(options.name ?? 'CraftAIB'),
    SchematicVersion: intTag(options.version ?? 4),
    McDataVersion: intTag(options.minecraftDataVersion ?? 2584),
    ...(options.originalOrigin ? { Origin: vecTag(options.originalOrigin) } : {}),
  });
  return { name: '', value: { MinecraftDataVersion: intTag(options.minecraftDataVersion ?? 2584), Version: intTag(options.version ?? 4), Metadata: metadata, Regions: compound(regionTags) } };
}

export async function serializeLitematica(grid: BlockGrid, options: LitematicaOptions = {}): Promise<Uint8Array> {
  const schema = generateLitematicaSchema(grid, options);
  return gzip(encodeCompound(schema.name, schema.value));
}

export async function serializeLitematicaRegions(regions: LitematicaRegionInput[], options: LitematicaOptions = {}): Promise<Uint8Array> {
  const schema = generateLitematicaDocumentSchema(regions, options);
  return gzip(encodeCompound(schema.name, schema.value));
}

function createRegionTag(input: LitematicaRegionInput, dataVersion: number) {
  const { grid } = input;
  validateGrid(grid);
  const size = input.size ?? dimensions(grid);
  const position = input.position ?? { x: 0, y: 0, z: 0 };
  validateVector(position, 'position');
  validateVector(size, 'size');
  if (Math.abs(size.x) !== grid.width || Math.abs(size.y) !== grid.height || Math.abs(size.z) !== grid.length) throw new Error(`Litematic region '${input.name}' size must match its grid dimensions.`);
  if (absoluteVolume(size) > 0x7fffffff) throw new Error(`Litematic region '${input.name}' exceeds the NBT volume limit.`);
  const palette = [{ Name: { type: 'string', value: 'minecraft:air' } }];
  const paletteIndex = new Map<string, number>([['minecraft:air|', 0]]);
  for (const cell of grid.cells) {
    const block = normalizeState(cell.block);
    const key = stateKey(block.id, block.properties);
    if (paletteIndex.has(key)) continue;
    paletteIndex.set(key, palette.length);
    palette.push({ Name: { type: 'string', value: block.id }, ...(block.properties ? { Properties: { type: 'compound', value: Object.fromEntries(Object.entries(block.properties).map(([name, value]) => [name, { type: 'string', value }])) } } : {}) });
  }
  const dims = { x: Math.abs(size.x), y: Math.abs(size.y), z: Math.abs(size.z) };
  const states = new Array(dims.x * dims.y * dims.z).fill(0);
  for (const cell of grid.cells) {
    const x = cell.x;
    const y = cell.y;
    const z = cell.z;
    const index = (y * dims.z + z) * dims.x + x;
    if (index < 0 || index >= states.length) throw new Error(`Litematic region '${input.name}' contains a cell outside its size.`);
    const block = normalizeState(cell.block);
    states[index] = paletteIndex.get(stateKey(block.id, block.properties)) ?? 0;
  }
  const bits = requiredBitWidth(palette.length);
  return {
    DataVersion: intTag(dataVersion),
    BlockStatePalette: { type: 'list', value: { type: 'compound', value: palette.map((entry) => ({ type: 'compound', value: entry })) } },
    BlockStates: { type: 'longArray', value: encodeLongArray(states, bits) },
    Position: vecTag(position),
    Size: vecTag(size),
    PendingBlockTicks: nbtList(input.grid.metadata?.pendingBlockTicks),
    TileEntities: nbtList(input.grid.metadata?.blockEntities),
    Entities: nbtList(input.grid.metadata?.entities),
  };
}

function getEnclosingSize(regions: LitematicaRegionInput[]): LitematicaVec3 {
  const bounds = regions.map((region) => {
    const position = region.position ?? { x: 0, y: 0, z: 0 };
    const size = region.size ?? dimensions(region.grid);
    return { minX: Math.min(position.x, position.x + signedEnd(size.x)), maxX: Math.max(position.x, position.x + signedEnd(size.x)), minY: Math.min(position.y, position.y + signedEnd(size.y)), maxY: Math.max(position.y, position.y + signedEnd(size.y)), minZ: Math.min(position.z, position.z + signedEnd(size.z)), maxZ: Math.max(position.z, position.z + signedEnd(size.z)) };
  });
  return { x: Math.max(...bounds.map((item) => item.maxX)) - Math.min(...bounds.map((item) => item.minX)) + 1, y: Math.max(...bounds.map((item) => item.maxY)) - Math.min(...bounds.map((item) => item.minY)) + 1, z: Math.max(...bounds.map((item) => item.maxZ)) - Math.min(...bounds.map((item) => item.minZ)) + 1 };
}

function dimensions(grid: BlockGrid): LitematicaVec3 { return { x: grid.width, y: grid.height, z: grid.length }; }
function validateVector(vector: LitematicaVec3, label: string) {
  if (!vector || ![vector.x, vector.y, vector.z].every((value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff)) throw new Error(`Litematic ${label} must contain 32-bit integer coordinates.`);
}
function absoluteVolume(size: LitematicaVec3): number { return Math.abs(size.x * size.y * size.z); }
function signedEnd(size: number): number { return size >= 0 ? size - 1 : size + 1; }
function stateKey(id: string, properties?: Record<string, string>) { return `${id}|${Object.entries(properties ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(';')}`; }
function requiredBitWidth(paletteSize: number): number { return Math.max(2, Math.ceil(Math.log2(Math.max(1, paletteSize)))); }
function encodeLongArray(states: number[], bits: number): bigint[] { const words = Array.from({ length: Math.ceil((states.length * bits) / 64) }, () => 0n); states.forEach((state, index) => { const offset = index * bits; const wordIndex = Math.floor(offset / 64); const bitOffset = offset % 64; words[wordIndex] |= BigInt(state) << BigInt(bitOffset); if (bitOffset + bits > 64) words[wordIndex + 1] |= BigInt(state) >> BigInt(64 - bitOffset); }); return words; }
const intTag = (value: number) => ({ type: 'int', value });
const stringTag = (value: string) => ({ type: 'string', value });
const longTag = (value: [number, number]) => ({ type: 'long', value });
const longNumberTag = (value: number) => { const integer = BigInt(Math.max(0, Math.trunc(value))); return longTag([Number(integer >> 32n), Number(integer & 0xffffffffn)]); };
const vecTag = (value: LitematicaVec3) => compound({ x: intTag(value.x), y: intTag(value.y), z: intTag(value.z) });
const compound = (value: Record<string, unknown>) => ({ type: 'compound', value });
const emptyList = () => ({ type: 'list', value: { type: 'end', value: [] } });
const nbtList = (items: unknown) => {
  if (items === undefined) return emptyList();
  if (!Array.isArray(items)) throw new Error('Litematic entity metadata must be an array.');
  const compounds = items.map((item) => {
    const entry = record(item, 'entity');
    if ('nbt' in entry) return { type: 'compound', value: record(entry.nbt, 'entity NBT') };
    if (entry.type === 'compound' || entry.type === 10) return { type: 'compound', value: record(entry.value, 'entity NBT') };
    throw new Error('Litematic entity metadata must contain an NBT compound.');
  });
  return compounds.length ? { type: 'list', value: { type: 'compound', value: compounds } } : emptyList();
};
const TAG: Record<string, number> = { end: 0, byte: 1, short: 2, int: 3, long: 4, float: 5, double: 6, byteArray: 7, string: 8, list: 9, compound: 10, intArray: 11, longArray: 12 };
type WritableTag = { type: number | string; value: unknown };
class Writer {
  bytes: number[] = [];
  byte(v: number) { this.bytes.push(v & 255); }
  short(v: number) { this.byte(v >> 8); this.byte(v); }
  int(v: number) { this.byte(v >> 24); this.byte(v >> 16); this.byte(v >> 8); this.byte(v); }
  long(v: bigint) { for (let shift = 56n; shift >= 0n; shift -= 8n) this.byte(Number((v >> shift) & 255n)); }
  float(v: number, width: 4 | 8) { const bytes = new Uint8Array(width); const view = new DataView(bytes.buffer); if (width === 4) view.setFloat32(0, v); else view.setFloat64(0, v); this.raw(bytes); }
  raw(values: Uint8Array | number[]) { for (const value of values) this.byte(value); }
  string(value: string) { const bytes = new TextEncoder().encode(value); if (bytes.length > 65535) throw new Error('NBT string exceeds 65535 encoded bytes.'); this.short(bytes.length); this.raw(bytes); }
  result() { return new Uint8Array(this.bytes); }
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label} compound.`);
  return value as Record<string, unknown>;
}
function tagId(type: unknown): number {
  const id = typeof type === 'number' ? type : typeof type === 'string' ? TAG[type] : undefined;
  if (id === undefined || !Number.isInteger(id) || id < 0 || id > 12) throw new Error(`Unsupported NBT tag: ${String(type)}`);
  return id;
}
function readTag(value: unknown): WritableTag { const tag = record(value, 'NBT tag'); tagId(tag.type); return tag as WritableTag; }
function encodeCompound(name: string, value: Record<string, unknown>) { const writer = new Writer(); writer.byte(TAG.compound); writer.string(name); encodeCompoundPayload(writer, value); return writer.result(); }
function encodeCompoundPayload(writer: Writer, value: Record<string, unknown>) {
  for (const [name, entry] of Object.entries(value)) { const tag = readTag(entry); if (tagId(tag.type) === 0) throw new Error('Named NBT tags cannot have end type.'); writer.byte(tagId(tag.type)); writer.string(name); encodePayload(writer, tag); }
  writer.byte(0);
}
function nbtNumber(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('NBT numeric tags require finite numbers.'); return value; }
function nbtInteger(value: unknown, min: number, max: number): number { const number = nbtNumber(value); if (!Number.isInteger(number) || number < min || number > max) throw new Error('NBT integer is outside its tag range.'); return number; }
function nbtLong(value: unknown): bigint {
  if (typeof value === 'bigint') return BigInt.asIntN(64, value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (Array.isArray(value) && value.length === 2) return (BigInt(nbtInteger(value[0], -0x80000000, 0xffffffff)) << 32n) | BigInt(nbtInteger(value[1], -0x80000000, 0xffffffff) >>> 0);
  throw new Error('NBT long requires a bigint, safe integer, or high/low pair.');
}
function nbtArray(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error('NBT array tag requires an array.'); return value; }
function encodePayload(writer: Writer, tag: WritableTag): void {
  const value = tag.value;
  switch (tagId(tag.type)) {
    case 1: writer.byte(nbtInteger(value, -128, 255)); break;
    case 2: writer.short(nbtInteger(value, -32768, 65535)); break;
    case 3: writer.int(nbtInteger(value, -0x80000000, 0x7fffffff)); break;
    case 4: writer.long(nbtLong(value)); break;
    case 5: writer.float(nbtNumber(value), 4); break;
    case 6: writer.float(nbtNumber(value), 8); break;
    case 7: { const bytes = value instanceof Uint8Array ? value : nbtArray(value).map((item) => nbtInteger(item, -128, 255)); writer.int(bytes.length); writer.raw(bytes); break; }
    case 8: if (typeof value !== 'string') throw new Error('NBT string tag requires a string.'); writer.string(value); break;
    case 9: {
      const list = record(value, 'NBT list');
      const type = tagId(list.type);
      const children = nbtArray(list.value);
      if (type === 0 && children.length) throw new Error('NBT end lists must be empty.');
      writer.byte(type); writer.int(children.length);
      for (const child of children) {
        const isWrapped = child !== null && typeof child === 'object' && 'type' in child && (typeof child.type === 'number' || typeof child.type === 'string') && 'value' in child && !(type === 9 && Array.isArray(child.value));
        const item = isWrapped ? readTag(child) : { type, value: child };
        if (tagId(item.type) !== type) throw new Error('NBT list contains a mismatched tag type.');
        encodePayload(writer, item);
      }
      break;
    }
    case 10: encodeCompoundPayload(writer, record(value, 'NBT')); break;
    case 11: { const values = nbtArray(value); writer.int(values.length); for (const item of values) writer.int(nbtInteger(item, -0x80000000, 0x7fffffff)); break; }
    case 12: { const values = nbtArray(value); writer.int(values.length); for (const item of values) writer.long(nbtLong(item)); break; }
    default: throw new Error('Unexpected standalone NBT end tag.');
  }
}
async function gzip(bytes: Uint8Array): Promise<Uint8Array> { if (typeof CompressionStream === 'undefined') throw new Error('CompressionStream is required to serialize Litematica.'); return new Uint8Array(await new Response(new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); }
