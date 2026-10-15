import type { BlockGrid } from '@craftaib/core';

export type LitematicaSchema = { name: string; value: Record<string, any> };
export type LitematicaVec3 = { x: number; y: number; z: number };
export type LitematicaRegionInput = { name: string; grid: BlockGrid; position?: LitematicaVec3; size?: LitematicaVec3; dataVersion?: number };
export type LitematicaOptions = { name?: string; author?: string; description?: string; version?: number; minecraftDataVersion?: number; originalOrigin?: LitematicaVec3; regions?: LitematicaRegionInput[] };

export function generateLitematicaSchema(grid: BlockGrid, options: LitematicaOptions = {}): LitematicaSchema {
  if (!grid.cells.length && !options.regions?.length) throw new Error('Cannot generate Litematica from an empty grid.');
  const regions = options.regions?.length ? options.regions : [{ name: 'CraftAIB', grid, position: { x: 0, y: 0, z: 0 } }];
  return generateLitematicaDocumentSchema(regions, options);
}

export function generateLitematicaDocumentSchema(regions: LitematicaRegionInput[], options: LitematicaOptions = {}): LitematicaSchema {
  if (!regions.length) throw new Error('Cannot generate Litematica without regions.');
  const regionTags = Object.fromEntries(regions.map((region, index) => [region.name || `Region_${index + 1}`, compound(createRegionTag(region, options.minecraftDataVersion ?? 2584))]));
  const totalBlocks = regions.reduce((total, region) => total + region.grid.cells.length, 0);
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
  const size = input.size ?? dimensions(grid);
  const position = input.position ?? { x: 0, y: 0, z: 0 };
  const palette = [{ Name: { type: 'string', value: 'minecraft:air' } }];
  const paletteIndex = new Map<string, number>([['minecraft:air|', 0]]);
  for (const cell of grid.cells) {
    const key = stateKey(cell.block.id, cell.block.properties);
    if (paletteIndex.has(key)) continue;
    paletteIndex.set(key, palette.length);
    palette.push({ Name: { type: 'string', value: cell.block.id }, ...(cell.block.properties ? { Properties: { type: 'compound', value: Object.fromEntries(Object.entries(cell.block.properties).map(([name, value]) => [name, { type: 'string', value }])) } } : {}) });
  }
  const dims = { x: Math.abs(size.x), y: Math.abs(size.y), z: Math.abs(size.z) };
  const states = new Array(dims.x * dims.y * dims.z).fill(0);
  for (const cell of grid.cells) {
    const x = cell.x;
    const y = cell.y;
    const z = cell.z;
    const index = (y * dims.z + z) * dims.x + x;
    if (index < 0 || index >= states.length) throw new Error(`Litematic region '${input.name}' contains a cell outside its size.`);
    states[index] = paletteIndex.get(stateKey(cell.block.id, cell.block.properties)) ?? 0;
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
  const compounds = Array.isArray(items) ? items.filter((item): item is { type: 'compound'; value: Record<string, unknown> } => Boolean(item && typeof item === 'object' && (item as any).type === 'compound')) : [];
  return compounds.length ? { type: 'list', value: { type: 'compound', value: compounds } } : emptyList();
};
const TAG: Record<string, number> = { byte: 1, short: 2, int: 3, long: 4, float: 5, double: 6, byteArray: 7, string: 8, list: 9, compound: 10, intArray: 11, longArray: 12 };
class Writer { bytes: number[] = []; byte(v: number) { this.bytes.push(v & 255); } short(v: number) { this.byte(v >> 8); this.byte(v); } int(v: number) { this.byte(v >> 24); this.byte(v >> 16); this.byte(v >> 8); this.byte(v); } long(v: bigint) { for (let shift = 56n; shift >= 0n; shift -= 8n) this.byte(Number((v >> shift) & 255n)); } raw(values: Uint8Array | number[]) { for (const value of values) this.byte(value); } string(value: string) { const bytes = new TextEncoder().encode(value); this.short(bytes.length); this.raw(bytes); } result() { return new Uint8Array(this.bytes); } }
function encodeCompound(name: string, value: Record<string, any>) { const writer = new Writer(); writer.byte(TAG.compound); writer.string(name); encodeCompoundPayload(writer, value); return writer.result(); }
function encodeCompoundPayload(writer: Writer, value: Record<string, any>) { for (const [name, tag] of Object.entries(value)) { writer.byte(TAG[tag.type]); writer.string(name); encodePayload(writer, tag); } writer.byte(0); }
function encodePayload(writer: Writer, tag: any) { switch (tag.type) { case 'string': writer.string(tag.value); break; case 'int': writer.int(tag.value); break; case 'long': writer.long((BigInt(tag.value[0]) << 32n) | BigInt(tag.value[1] >>> 0)); break; case 'compound': encodeCompoundPayload(writer, tag.value); break; case 'list': writer.byte(TAG[tag.value.type]); writer.int(tag.value.value.length); for (const child of tag.value.value) encodePayload(writer, child); break; case 'longArray': writer.int(tag.value.length); for (const value of tag.value) writer.long(BigInt.asIntN(64, BigInt(value))); break; default: throw new Error(`Unsupported NBT tag: ${tag.type}`); } }
async function gzip(bytes: Uint8Array): Promise<Uint8Array> { if (typeof CompressionStream === 'undefined') throw new Error('CompressionStream is required to serialize Litematica.'); return new Uint8Array(await new Response(new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); }
