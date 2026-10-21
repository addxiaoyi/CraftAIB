import type { BlockGrid, BlockState } from '@craftaib/core';
import { createGrid } from '../../core/dist/index.js';
import { gunzip, Reader } from './parse.js';

export type NbtTag = { type?: number; value?: any };
export type NbtCompound = Record<string, NbtTag>;
export type LitematicaVec3 = { x: number; y: number; z: number };

export type LitematicaMetadata = {
  name: string;
  author: string;
  description: string;
  enclosingSize: LitematicaVec3;
  regionCount: number;
  entityCount: number;
  totalVolume: number;
  totalBlocks: number;
  blockEntityCount: number;
  blockTickCount: number;
  schematicVersion: number;
  minecraftDataVersion: number;
  timeCreated: number;
  timeModified: number;
  originalOrigin?: LitematicaVec3;
  previewImageData?: number[];
};

export type LitematicaBlockEntity = { position?: LitematicaVec3; nbt: NbtCompound };
export type LitematicaEntity = { position?: { x: number; y: number; z: number }; nbt: NbtCompound };
export type LitematicaBlockTick = { position?: LitematicaVec3; nbt: NbtCompound };

export type LitematicaRegion = {
  name: string;
  position: LitematicaVec3;
  size: LitematicaVec3;
  dimensions: LitematicaVec3;
  dataVersion: number;
  palette: BlockState[];
  cells: BlockGrid['cells'];
  blockEntities: LitematicaBlockEntity[];
  entities: LitematicaEntity[];
  pendingBlockTicks: LitematicaBlockTick[];
};

export type LitematicaDocument = {
  formatVersion: number;
  minecraftDataVersion: number;
  metadata: LitematicaMetadata;
  regions: LitematicaRegion[];
};

type RegionTag = NbtCompound;

export async function parseLitematicaDocumentBytes(input: Uint8Array): Promise<LitematicaDocument> {
  const root = new Reader(await gunzip(input)).tag().value as NbtCompound;
  const regionsTag = root?.Regions?.value;
  const entries = collectRegionEntries(regionsTag);
  if (!entries.length) throw new Error('Litematic contains no regions.');

  const formatVersion = numberValue(root?.Version, 0);
  const minecraftDataVersion = numberValue(root?.MinecraftDataVersion, -1);
  const regions = entries.map(([name, region]) => parseRegion(name, region, minecraftDataVersion));
  const metadata = parseMetadata(root?.Metadata?.value, formatVersion, minecraftDataVersion, regions);
  return { formatVersion, minecraftDataVersion, metadata, regions };
}

export function summarizeLitematicaDocument(document: LitematicaDocument) {
  return {
    formatVersion: document.formatVersion,
    minecraftDataVersion: document.minecraftDataVersion,
    metadata: document.metadata,
    regions: document.regions.map((region) => ({
      name: region.name,
      position: region.position,
      size: region.size,
      dimensions: region.dimensions,
      blocks: region.cells.length,
      materials: Object.fromEntries(region.cells.reduce((counts, cell) => counts.set(cell.block.id, (counts.get(cell.block.id) ?? 0) + 1), new Map<string, number>())),
      blockEntities: region.blockEntities.length,
      entities: region.entities.length,
      pendingBlockTicks: region.pendingBlockTicks.length,
    })),
  };
}

export async function parseLitematicaBytes(input: Uint8Array): Promise<BlockGrid> {
  return flattenLitematicaDocument(await parseLitematicaDocumentBytes(input));
}

export function flattenLitematicaDocument(document: LitematicaDocument): BlockGrid {
  if (!document.regions.length) throw new Error('Litematic contains no regions.');
  const entries = document.regions.flatMap((region) => region.cells);
  if (!entries.length) {
    const size = document.metadata.enclosingSize;
    return createGrid([], { width: Math.max(1, size.x), height: Math.max(1, size.y), length: Math.max(1, size.z) }, 'craftmatic');
  }

  const minX = Math.min(...entries.map((cell) => cell.x));
  const minY = Math.min(...entries.map((cell) => cell.y));
  const minZ = Math.min(...entries.map((cell) => cell.z));
  const maxX = Math.max(...entries.map((cell) => cell.x));
  const maxY = Math.max(...entries.map((cell) => cell.y));
  const maxZ = Math.max(...entries.map((cell) => cell.z));
  const cells = new Map<string, BlockGrid['cells'][number]>();
  for (const cell of entries) {
    const x = cell.x - minX;
    const y = cell.y - minY;
    const z = cell.z - minZ;
    cells.set(`${x},${y},${z}`, { ...cell, x, y, z });
  }
  const grid = createGrid([...cells.values()], { width: maxX - minX + 1, height: maxY - minY + 1, length: maxZ - minZ + 1 }, 'craftmatic');
  grid.origin = { x: minX, y: minY, z: minZ };
  grid.metadata = {
    entities: document.regions.flatMap((region) => region.entities),
    blockEntities: document.regions.flatMap((region) => region.blockEntities),
    pendingBlockTicks: document.regions.flatMap((region) => region.pendingBlockTicks),
    litematicaMetadata: document.metadata,
  };
  return grid;
}

function collectRegionEntries(value: any, prefix = ''): Array<[string, RegionTag]> {
  if (!value || typeof value !== 'object') return [];
  if (isRegion(value)) return [[prefix || 'CraftAIB', value as RegionTag]];
  const entries: Array<[string, RegionTag]> = [];
  for (const [key, entry] of Object.entries(value)) {
    const child = (entry as NbtTag)?.value ?? entry;
    if (!child || typeof child !== 'object') continue;
    const nested = collectRegionEntries(child, key);
    for (const [name, region] of nested) entries.push([name || key, region]);
  }
  return entries;
}

function isRegion(value: any): boolean {
  return Boolean(value?.Size && value?.BlockStatePalette && value?.BlockStates);
}

function parseRegion(name: string, region: RegionTag, mainDataVersion: number): LitematicaRegion {
  const size = readVec3(region.Size?.value);
  const dimensions = { x: Math.abs(size.x), y: Math.abs(size.y), z: Math.abs(size.z) };
  if (![dimensions.x, dimensions.y, dimensions.z].every((value) => Number.isInteger(value) && value > 0)) throw new Error(`Litematic region '${name}' has invalid dimensions.`);
  const position = readVec3(region.Position?.value);
  const palette = readPalette(region.BlockStatePalette?.value?.value);
  const words = region.BlockStates?.value as bigint[];
  const volume = dimensions.x * dimensions.y * dimensions.z;
  const bits = requiredBitWidth(palette.length);
  const requiredWords = Math.ceil((volume * bits) / 64);
  if (!Array.isArray(words) || words.length < requiredWords) throw new Error(`Litematic region '${name}' BlockStates data is truncated.`);

  const cells: BlockGrid['cells'] = [];
  for (let index = 0; index < volume; index += 1) {
    const stateIndex = readPackedState(words, index, bits);
    const state = palette[stateIndex] ?? { id: 'minecraft:air' };
    if (state.id === 'minecraft:air') continue;
    const localX = index % dimensions.x;
    const localY = Math.floor(index / (dimensions.x * dimensions.z));
    const localZ = Math.floor(index / dimensions.x) % dimensions.z;
    cells.push({ x: signedCoordinate(position.x, size.x, localX), y: signedCoordinate(position.y, size.y, localY), z: signedCoordinate(position.z, size.z, localZ), block: state, source: 'craftmatic' });
  }

  return {
    name,
    position,
    size,
    dimensions,
    dataVersion: numberValue(region.DataVersion, mainDataVersion),
    palette,
    cells,
    blockEntities: readList(region.TileEntities).map((nbt) => ({ position: readVec3(nbt), nbt })),
    entities: readList(region.Entities).map((nbt) => ({ position: readEntityPosition(nbt), nbt })),
    pendingBlockTicks: readList(region.PendingBlockTicks).map((nbt) => ({ position: readVec3(nbt), nbt })),
  };
}

function parseMetadata(value: any, formatVersion: number, minecraftDataVersion: number, regions: LitematicaRegion[]): LitematicaMetadata {
  const regionCount = numberValue(value?.RegionCount, regions.length);
  const size = value?.EnclosingSize?.value ? readVec3(value.EnclosingSize.value) : enclosingSize(regions);
  return {
    name: stringValue(value?.Name, '<no name>'),
    author: stringValue(value?.Author, ''),
    description: stringValue(value?.Description, ''),
    enclosingSize: size,
    regionCount,
    entityCount: numberValue(value?.EntityCount, regions.reduce((total, region) => total + region.entities.length, 0)),
    totalVolume: numberValue(value?.TotalVolume, size.x * size.y * size.z),
    totalBlocks: numberValue(value?.TotalBlocks, regions.reduce((total, region) => total + region.cells.length, 0)),
    blockEntityCount: numberValue(value?.BlockEntityCount, regions.reduce((total, region) => total + region.blockEntities.length, 0)),
    blockTickCount: numberValue(value?.BlockTickCount, regions.reduce((total, region) => total + region.pendingBlockTicks.length, 0)),
    schematicVersion: numberValue(value?.SchematicVersion, formatVersion),
    minecraftDataVersion: numberValue(value?.McDataVersion, minecraftDataVersion),
    timeCreated: numberValue(value?.TimeCreated, -1),
    timeModified: numberValue(value?.TimeModified, -1),
    ...(value?.Origin?.value ? { originalOrigin: readVec3(value.Origin.value) } : {}),
    ...(Array.isArray(value?.PreviewImageData?.value) ? { previewImageData: value.PreviewImageData.value.map(Number) } : {}),
  };
}

function readPalette(value: any): BlockState[] {
  if (!Array.isArray(value)) throw new Error('Litematic region is missing BlockStatePalette.');
  return value.map((entry) => formatState(entry));
}

function formatState(entry: any): BlockState {
  const name = stringValue(entry?.Name, 'minecraft:air');
  const properties = entry?.Properties?.value ?? {};
  const pairs = Object.entries(properties).map(([key, value]: [string, any]) => [key, stringValue(value, '')]);
  return pairs.length ? { id: name, properties: Object.fromEntries(pairs) } : { id: name };
}

function parseState(value: string): BlockState {
  const match = /^([^[]+)(?:\[(.*)\])?$/.exec(value);
  if (!match) return { id: value };
  const properties = Object.fromEntries((match[2] ?? '').split(',').filter(Boolean).map((item) => { const split = item.indexOf('='); return split < 0 ? [item, ''] : [item.slice(0, split), item.slice(split + 1)]; }));
  return Object.keys(properties).length ? { id: match[1], properties } : { id: match[1] };
}

function readEntityPosition(nbt: NbtCompound): { x: number; y: number; z: number } | undefined { const values = nbt.Pos?.value?.value; if (Array.isArray(values) && values.length >= 3 && values.slice(0, 3).every((value: unknown) => Number.isFinite(Number(value)))) return { x: Number(values[0]), y: Number(values[1]), z: Number(values[2]) }; const position = readVec3(nbt); return nbt.x || nbt.y || nbt.z ? position : undefined; }

function readList(tag?: NbtTag): NbtCompound[] {
  const value = tag?.value?.value;
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') as NbtCompound[] : [];
}

function readVec3(value: any): LitematicaVec3 {
  return { x: numberValue(value?.x, 0), y: numberValue(value?.y, 0), z: numberValue(value?.z, 0) };
}

function enclosingSize(regions: LitematicaRegion[]): LitematicaVec3 {
  const bounds = regions.flatMap((region) => region.cells);
  if (!bounds.length) return { x: 1, y: 1, z: 1 };
  return { x: Math.max(...bounds.map((cell) => cell.x)) - Math.min(...bounds.map((cell) => cell.x)) + 1, y: Math.max(...bounds.map((cell) => cell.y)) - Math.min(...bounds.map((cell) => cell.y)) + 1, z: Math.max(...bounds.map((cell) => cell.z)) - Math.min(...bounds.map((cell) => cell.z)) + 1 };
}

function signedCoordinate(origin: number, size: number, local: number): number { return origin + (size < 0 ? size + 1 + local : local); }
function requiredBitWidth(paletteSize: number): number { return Math.max(2, Math.ceil(Math.log2(Math.max(1, paletteSize)))); }
function readPackedState(words: bigint[], index: number, bits: number): number { const offset = index * bits; const wordIndex = Math.floor(offset / 64); const bitOffset = offset % 64; const mask = (1n << BigInt(bits)) - 1n; let value = BigInt.asUintN(64, words[wordIndex] ?? 0n) >> BigInt(bitOffset); if (bitOffset + bits > 64) value |= BigInt.asUintN(64, words[wordIndex + 1] ?? 0n) << BigInt(64 - bitOffset); return Number(value & mask); }
function numberValue(tag: any, fallback: number): number { const value = tag?.value ?? tag; return typeof value === 'bigint' ? Number(value) : Number.isFinite(Number(value)) ? Number(value) : fallback; }
function stringValue(tag: any, fallback: string): string { const value = tag?.value ?? tag; return typeof value === 'string' ? value : fallback; }
