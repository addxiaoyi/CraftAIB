import { createGrid, type BlockGrid, type BlockState } from '../../core/dist/index.js';

export async function parseSchematicBytes(input: Uint8Array): Promise<BlockGrid> {
  const raw = await gunzip(input); const reader = new Reader(raw); const root = reader.tag(); const source = root.value.Schematic?.value ?? root.value;
  const width = schematicDimension(source.Width); const height = schematicDimension(source.Height); const length = schematicDimension(source.Length);
  const paletteEntries = Object.entries(source.Palette?.value ?? {}) as Array<[string, { value: number }]>; const palette = paletteEntries.sort(([, a], [, b]) => a.value - b.value).map(([state]) => state); const bytes = source.BlockData?.value ?? new Uint8Array(); const ids = decodeVarints(bytes, width * height * length); const cells = [];
  for (let index = 0; index < ids.length; index += 1) { const state = palette[ids[index] ?? 0] ?? 'minecraft:air'; if (state === 'minecraft:air') continue; cells.push({ x: index % width, y: Math.floor(index / (width * length)), z: Math.floor(index / width) % length, block: parseState(state), source: 'craftmatic' as const }); }
  return createGrid(cells, { width, height, length }, 'craftmatic');
}
// Sponge dimensions use unsigned shorts even though general NBT shorts are signed.
function schematicDimension(tag: { type: number; value: number } | undefined): number { return tag?.type === 2 ? tag.value & 0xffff : tag?.value ?? 0; }
function parseState(value: string): BlockState { const match = value.match(/^([^[]+)(?:\[(.*)\])?$/); if (!match) return { id: value }; const properties = match[2] ? Object.fromEntries(match[2].split(',').map((item) => item.split('='))) : undefined; return { id: match[1], ...(properties ? { properties } : {}) }; }
function decodeVarints(bytes: Uint8Array, count: number) { const values: number[] = []; let offset = 0; for (let i = 0; i < count; i += 1) { let value = 0; let shift = 0; let complete = false; while (offset < bytes.length) { const byte = bytes[offset++]; value |= (byte & 127) << shift; if (!(byte & 128)) { complete = true; break; } shift += 7; if (shift > 35) throw new Error('Schematic varint is too large.'); } if (!complete) throw new Error(`Schematic BlockData ended while reading cell ${i}.`); values.push(value); } return values; }
export class Reader {
  offset = 0;
  private depth = 0;
  constructor(private readonly bytes: Uint8Array) {}
  private require(length: number): void {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.bytes.length - this.offset) throw new Error('Unexpected end of NBT data or invalid length.');
  }
  byte() { this.require(1); return this.bytes[this.offset++]; }
  short() { return (this.byte() << 8) | this.byte(); }
  int() { return (this.byte() << 24) | (this.byte() << 16) | (this.byte() << 8) | this.byte(); }
  private long() { let value = 0n; for (let i = 0; i < 8; i += 1) value = (value << 8n) | BigInt(this.byte()); return BigInt.asIntN(64, value); }
  string() { const length = this.short(); this.require(length); const value = new TextDecoder().decode(this.bytes.subarray(this.offset, this.offset + length)); this.offset += length; return value; }
  float() { this.require(4); const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4).getFloat32(0, false); this.offset += 4; return value; }
  double() { this.require(8); const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8).getFloat64(0, false); this.offset += 8; return value; }
  tag(): { type: number; name?: string; value: any } {
    const type = this.byte();
    if (type === 0) return { type, value: null };
    const name = this.string();
    return { type, name, value: this.payload(type) };
  }
  payload(type: number): any {
    this.depth += 1;
    if (this.depth > 512) throw new Error('NBT nesting exceeds 512 levels.');
    try { return this.readPayload(type); } finally { this.depth -= 1; }
  }
  private readPayload(type: number): any {
    if (type === 1) return (this.byte() << 24) >> 24;
    if (type === 2) return (this.short() << 16) >> 16;
    if (type === 3) return this.int();
    if (type === 4) return this.long();
    if (type === 5) return this.float();
    if (type === 6) return this.double();
    if (type === 7) { const length = this.int(); this.require(length); const value = this.bytes.slice(this.offset, this.offset + length); this.offset += length; return value; }
    if (type === 8) return this.string();
    if (type === 9) {
      const itemType = this.byte();
      const length = this.int();
      if (itemType > 12 || (itemType === 0 && length !== 0)) throw new Error('Invalid NBT list element type.');
      this.require(length);
      const value = [];
      for (let i = 0; i < length; i += 1) value.push(this.payload(itemType));
      return { type: itemType, value };
    }
    if (type === 10) {
      const value: Record<string, any> = {};
      while (true) {
        const child = this.tag();
        if (child.type === 0) break;
        if (child.name !== undefined) Object.defineProperty(value, child.name, { value: child, enumerable: true, configurable: true, writable: true });
      }
      return value;
    }
    if (type === 11 || type === 12) {
      const length = this.int();
      this.require(length * (type === 11 ? 4 : 8));
      const value = [];
      for (let i = 0; i < length; i += 1) value.push(type === 11 ? this.int() : this.long());
      return value;
    }
    throw new Error(`Unsupported NBT tag ${type}.`);
  }
}
export async function gunzip(input: Uint8Array) {
  if (input[0] !== 0x1f || input[1] !== 0x8b) return input;
  if (typeof DecompressionStream !== 'undefined') {
    try { const bytes = input.slice(); return new Uint8Array(await new Response(new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); }
    catch (error) {
      if (typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node !== 'undefined') {
        const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ gunzipSync(input: Uint8Array): Uint8Array }>;
        try { return new Uint8Array((await dynamicImport('node:zlib')).gunzipSync(input)); } catch { /* Report the browser stream failure below. */ }
      }
      throw new Error(`Unable to decompress Minecraft structure: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ gunzipSync(input: Uint8Array): Uint8Array }>;
  const { gunzipSync } = await dynamicImport('node:zlib');
  return new Uint8Array(gunzipSync(input));
}
