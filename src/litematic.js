const TAG = { byte: 1, short: 2, int: 3, long: 4, string: 8, list: 9, compound: 10, longArray: 12 };

class Writer {
  constructor() { this.bytes = []; }
  byte(value) { this.bytes.push(value & 255); }
  short(value) { this.byte(value >> 8); this.byte(value); }
  int(value) { this.byte(value >> 24); this.byte(value >> 16); this.byte(value >> 8); this.byte(value); }
  long(value) { for (let shift = 56n; shift >= 0n; shift -= 8n) this.byte(Number((value >> shift) & 255n)); }
  string(value) { const bytes = new TextEncoder().encode(value); this.short(bytes.length); bytes.forEach((byte) => this.byte(byte)); }
  finish() { return new Uint8Array(this.bytes); }
}

function tag(type, value) { return { type, value }; }
function compound(value) { return tag('compound', value); }
function stateKey(id, properties) { return `${id}|${Object.entries(properties ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(';')}`; }
function stateTag(id, properties) { return compound({ Name: tag('string', id), ...(properties && Object.keys(properties).length ? { Properties: compound(Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, tag('string', value)]))) } : {}) }); }

function encodeCompound(name, value) {
  const writer = new Writer(); writer.byte(TAG.compound); writer.string(name); encodeCompoundPayload(writer, value); return writer.finish();
}
function encodeCompoundPayload(writer, value) {
  for (const [name, item] of Object.entries(value)) { writer.byte(TAG[item.type]); writer.string(name); encodePayload(writer, item); }
  writer.byte(0);
}
function encodePayload(writer, item) {
  if (item.type === 'string' || item.type === 'int') { item.type === 'string' ? writer.string(item.value) : writer.int(item.value); return; }
  if (item.type === 'long') { writer.long((BigInt(item.value[0]) << 32n) | BigInt(item.value[1] >>> 0)); return; }
  if (item.type === 'compound') { encodeCompoundPayload(writer, item.value); return; }
  if (item.type === 'list') { writer.byte(TAG[item.value.type]); writer.int(item.value.value.length); item.value.value.forEach((child) => encodePayload(writer, child)); return; }
  if (item.type === 'longArray') { writer.int(item.value.length); item.value.forEach((value) => writer.long(BigInt.asIntN(64, BigInt(value)))); return; }
  throw new Error(`Unsupported Litematica tag: ${item.type}`);
}

function encodeStates(states, bits) {
  const perWord = Math.floor(64 / bits); const words = Array.from({ length: Math.ceil(states.length / perWord) }, () => 0n);
  states.forEach((state, index) => { words[Math.floor(index / perWord)] |= BigInt(state) << BigInt((index % perWord) * bits); });
  return words;
}

function normalize(blocks, palette, materials) {
  if (!Array.isArray(blocks) || !Array.isArray(materials) || blocks.length === 0 || blocks.length !== materials.length) throw new Error('Voxelization has not produced a valid block grid.');
  const cells = blocks.map((block, index) => { const entry = palette[materials[index]]; if (!entry) throw new Error('Missing voxel palette entry.'); return { x: block[3], y: block[4], z: block[5], id: `minecraft:${entry[0]}` }; });
  const minX = Math.min(...cells.map((cell) => cell.x)); const minY = Math.min(...cells.map((cell) => cell.y)); const minZ = Math.min(...cells.map((cell) => cell.z));
  const normalized = cells.map((cell) => ({ ...cell, x: cell.x - minX, y: cell.y - minY, z: cell.z - minZ }));
  return { cells: normalized, width: Math.max(...normalized.map((cell) => cell.x)) + 1, height: Math.max(...normalized.map((cell) => cell.y)) + 1, length: Math.max(...normalized.map((cell) => cell.z)) + 1 };
}

async function gzip(bytes) {
  if (typeof CompressionStream === 'undefined') throw new Error('This browser does not support gzip export.');
  return new Uint8Array(await new Response(new Blob([bytes.buffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}

async function createLitematicFile(blocks, palette, materials) {
  const grid = normalize(blocks, palette, materials); const paletteEntries = [stateTag('minecraft:air')]; const paletteIndex = new Map([['minecraft:air|', 0]]);
  for (const cell of grid.cells) { const key = `${cell.id}|`; if (!paletteIndex.has(key)) { paletteIndex.set(key, paletteEntries.length); paletteEntries.push(stateTag(cell.id)); } }
  const states = new Array(grid.width * grid.height * grid.length).fill(0); const cells = new Map(grid.cells.map((cell) => [`${cell.x}:${cell.y}:${cell.z}`, cell]));
  for (let y = 0; y < grid.height; y += 1) for (let z = 0; z < grid.length; z += 1) for (let x = 0; x < grid.width; x += 1) { const cell = cells.get(`${x}:${y}:${z}`); states[(y * grid.length + z) * grid.width + x] = cell ? paletteIndex.get(`${cell.id}|`) : 0; }
  const bits = Math.max(2, Math.ceil(Math.log2(paletteEntries.length))); const schema = compound({ MinecraftDataVersion: tag('int', 2584), Version: tag('int', 5), Metadata: compound({ TimeCreated: tag('long', [0, 0]), TimeModified: tag('long', [0, 0]), EnclosingSize: compound({ x: tag('int', grid.width), y: tag('int', grid.height), z: tag('int', grid.length) }), Description: tag('string', 'Generated by CraftAIB'), RegionCount: tag('int', 1), TotalBlocks: tag('int', grid.cells.length), Author: tag('string', 'CraftAIB'), TotalVolume: tag('int', grid.width * grid.height * grid.length), Name: tag('string', 'CraftAIB Map Art') }), Regions: compound({ map: compound({ BlockStates: tag('longArray', encodeStates(states, bits)), BlockStatePalette: tag('list', { type: 'compound', value: paletteEntries }), Position: compound({ x: tag('int', 0), y: tag('int', 0), z: tag('int', 0) }), Size: compound({ x: tag('int', grid.width), y: tag('int', grid.height), z: tag('int', grid.length) }), PendingBlockTicks: tag('list', { type: 'end', value: [] }), PendingFluidTicks: tag('list', { type: 'end', value: [] }), TileEntities: tag('list', { type: 'end', value: [] }), Entities: tag('list', { type: 'end', value: [] }) }) }) });
  return new File([await gzip(encodeCompound('', schema.value))], 'craftaib.litematic', { type: 'application/gzip' });
}

export { createLitematicFile };
