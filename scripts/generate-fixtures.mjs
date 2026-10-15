import { mkdir, writeFile } from 'node:fs/promises';
import { createGrid } from '../packages/core/dist/index.js';
import { planBuilding, structurePlanToRegionGrids } from '../packages/ai-planner/dist/index.js';
import { serializeLitematica, serializeLitematicaRegions } from '../packages/cartographer-adapter/dist/index.js';
import { serializeSchematic } from '../packages/craftmatic-adapter/dist/index.js';

const grid = createGrid([
  { x: 0, y: 0, z: 0, block: { id: 'minecraft:stone' } },
  { x: 1, y: 0, z: 0, block: { id: 'minecraft:oak_log', properties: { axis: 'y' } } },
  { x: 0, y: 1, z: 0, block: { id: 'minecraft:glass' } },
], { width: 2, height: 2, length: 1 });
await mkdir(new URL('../fixtures/', import.meta.url), { recursive: true });
await writeFile(new URL('../fixtures/smoke.schem', import.meta.url), await serializeSchematic(grid));
await writeFile(new URL('../fixtures/smoke.litematic', import.meta.url), await serializeLitematica(grid, { name: 'CraftAIB Smoke Fixture', author: 'CraftAIB' }));
const aiPlan = planBuilding({ prompt: 'gothic castle 3 floors with turret and courtyard', seed: 42 });
await writeFile(new URL('../fixtures/ai-smoke.litematic', import.meta.url), await serializeLitematicaRegions(structurePlanToRegionGrids(aiPlan), { name: aiPlan.name, author: 'CraftAIB', description: 'Deterministic AI named-region fixture.' }));
const splitGrid = createGrid([
  { x: 0, y: 0, z: 0, block: { id: 'minecraft:stone' } },
  { x: 2, y: 0, z: 0, block: { id: 'minecraft:gold_block' } },
], { width: 3, height: 1, length: 1 });
await writeFile(new URL('../fixtures/smoke-multi-region.litematic', import.meta.url), await serializeLitematica(splitGrid, { name: 'CraftAIB Multi Region Fixture', author: 'CraftAIB' }));


const TAG = { int: 3, longArray: 12, string: 8, list: 9, compound: 10 };
function tag(type, name, value) { return { type, name, value }; }
function encodeTag(writer, entry) { writer.byte(TAG[entry.type]); writer.string(entry.name); encodePayload(writer, entry.type, entry.value); }
function encodePayload(writer, type, value) {
  if (type === 'int') return writer.int(value);
  if (type === 'string') return writer.string(value);
  if (type === 'longArray') { writer.int(value.length); for (const item of value) writer.long(item); return; }
  if (type === 'compound') { const entries = value?.type === 'compound' ? value.value : value; for (const entry of Object.values(entries)) encodeTag(writer, entry); writer.byte(0); return; }
  if (type === 'list') { writer.byte(TAG[value.itemType]); writer.int(value.items.length); for (const item of value.items) encodePayload(writer, value.itemType, item); return; }
  throw new Error('Unsupported fixture tag: ' + type);
}
function compound(name, entries) { return tag('compound', name, Object.fromEntries(entries.map((entry) => [entry.name, entry]))); }
function intTag(name, value) { return tag('int', name, value); }
function position(x, y, z) { return compound('Position', [intTag('x', x), intTag('y', y), intTag('z', z)]); }
function size(x, y, z) { return compound('Size', [intTag('x', x), intTag('y', y), intTag('z', z)]); }
function palette(name) { return tag('list', 'BlockStatePalette', { itemType: 'compound', items: [compound('', [tag('string', 'Name', name)])] }); }
function region(name, x, block) { return compound(name, [position(x, 0, 0), size(1, 1, 1), palette(block), tag('longArray', 'BlockStates', [0n])]); }
class NbtWriter { bytes = []; byte(value) { this.bytes.push(value & 255); } int(value) { this.byte(value >> 24); this.byte(value >> 16); this.byte(value >> 8); this.byte(value); } long(value) { for (let shift = 56n; shift >= 0n; shift -= 8n) this.byte(Number((value >> shift) & 255n)); } string(value) { const bytes = new TextEncoder().encode(value); this.int16(bytes.length); this.bytes.push(...bytes); } int16(value) { this.byte(value >> 8); this.byte(value); } result() { return Buffer.from(this.bytes); } }
async function writeMultiRegionFixture() { const writer = new NbtWriter(); writer.byte(TAG.compound); writer.string(''); encodePayload(writer, 'compound', { Regions: compound('Regions', [compound('map', [region('Left', -2, 'minecraft:stone'), region('Right', 1, 'minecraft:gold_block')])]) }); const { gzipSync } = await import('node:zlib'); await writeFile(new URL('../fixtures/smoke-two-regions.litematic', import.meta.url), gzipSync(writer.result())); }
await writeMultiRegionFixture();
console.log('schematic fixtures generated');
