import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { planBuildingWithVision, structurePlanToRegionGrids } from '../packages/ai-planner/dist/index.js';
import { serializeLitematicaRegions } from '../packages/cartographer-adapter/dist/index.js';
import { parseLitematicaDocumentBytes, parseSchematicBytes, serializeSchematic, summarizeLitematicaDocument } from '../packages/craftmatic-adapter/dist/index.js';

await loadLocalEnv();
const endpoint = process.env.CRAFTAIB_MODEL_API_URL || process.env.CRAFTAIB_VISION_API_URL;
if (!endpoint) { console.log('VISION_LIVE_SMOKE_SKIPPED: configure CRAFTAIB_MODEL_API_URL or CRAFTAIB_VISION_API_URL first.'); process.exit(0); }
const imageNames = (process.env.CRAFTAIB_REFERENCE_IMAGES || 'example1.png,example2.png,example3.png,example4.png').split(',').map((name) => name.trim()).filter(Boolean);
const outputDir = resolve(process.env.CRAFTAIB_VISION_OUTPUT_DIR || 'outputs/vision-live');
await mkdir(outputDir, { recursive: true });
const results = [];
for (const imageName of imageNames) {
  const image = await readFile(resolve('examples', imageName));
  const dataUrl = `data:image/png;base64,${image.toString('base64')}`;
  const dimensions = readPngDimensions(image);
  const prompt = process.env.CRAFTAIB_VISION_PROMPT ?? 'Strictly reconstruct this reference image as a buildable Minecraft structure. Preserve silhouette, proportions, floors, roof, windows, towers, courtyard, facade materials, and distinctive landmarks.';
  const plan = await planBuildingWithVision({ prompt, seed: 42, referenceImage: { ...dimensions, dataUrl, sourceName: imageName } }, { endpoint, apiKey: process.env.CRAFTAIB_MODEL_API_KEY || process.env.CRAFTAIB_VISION_API_KEY, model: process.env.CRAFTAIB_MODEL || process.env.CRAFTAIB_VISION_MODEL, maxRetries: 2, requestTimeoutMs: Number(process.env.CRAFTAIB_VISION_TIMEOUT_MS || process.env.CRAFTAIB_MODEL_TIMEOUT_MS || 120000) });
  const regions = structurePlanToRegionGrids(plan);
  assert.ok(regions.length > 0);
  const litematicBytes = await serializeLitematicaRegions(regions, { name: plan.name, author: 'CraftAIB', description: `Live vision smoke: ${imageName}` });
  const document = await parseLitematicaDocumentBytes(litematicBytes);
  assert.equal(document.regions.length, regions.length);
  const mergedByPosition = new Map();
  for (const region of regions) {
    for (const cell of region.grid.cells) {
      const worldCell = { ...cell, x: cell.x + region.position.x, y: cell.y + region.position.y, z: cell.z + region.position.z };
      mergedByPosition.set(`${worldCell.x},${worldCell.y},${worldCell.z}`, worldCell);
    }
  }
  const merged = [...mergedByPosition.values()];
  const palette = [...new Map([{ id: 'minecraft:air' }, ...merged.map((cell) => cell.block)].map((block) => [block.id + JSON.stringify(block.properties ?? {}), block])).values()];
  const grid = { version: 1, width: plan.dimensions.width, height: plan.dimensions.height, length: plan.dimensions.length, cells: merged, palette, coordinateSystem: 'xyz', origin: { x: 0, y: 0, z: 0 } };
  const schemBytes = await serializeSchematic(grid);
  await writeFile(resolve(outputDir, `${imageName}.litematic`), litematicBytes);
  await writeFile(resolve(outputDir, `${imageName}.schem`), schemBytes);
  const schemRoundTrip = await parseSchematicBytes(schemBytes);
  assert.ok(schemRoundTrip.cells.length > 0);
  const litematicSummary = summarizeLitematicaDocument(document);
  const report = {
    image: imageName,
    source: { file: imageName, width: dimensions.width, height: dimensions.height, prompt },
    inference: plan.inference,
    plan: { name: plan.name, type: plan.type, style: plan.style, dimensions: plan.dimensions, floors: plan.floors, notes: plan.notes },
    regions: litematicSummary.regions,
    materials: Object.fromEntries(schemRoundTrip.cells.reduce((counts, cell) => counts.set(cell.block.id, (counts.get(cell.block.id) ?? 0) + 1), new Map())),
    roundTrip: { litematicRegions: document.regions.length, schematicBlocks: schemRoundTrip.cells.length, sourceBlocks: merged.length, duplicateRegionCellsCollapsed: regions.reduce((sum, region) => sum + region.grid.cells.length, 0) - merged.length, dimensions: { width: schemRoundTrip.width, height: schemRoundTrip.height, length: schemRoundTrip.length }, blockStatesPreserved: schemRoundTrip.cells.every((cell) => Boolean(cell.block.id)) },
  };
  await writeFile(resolve(outputDir, `${imageName}.plan.json`), JSON.stringify(plan, null, 2));
  await writeFile(resolve(outputDir, `${imageName}.report.json`), JSON.stringify(report, null, 2));
  results.push(report);
}
console.log(JSON.stringify({ ok: true, outputDir, results }, null, 2));

async function loadLocalEnv() {
  try {
    const source = await readFile('.env', 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Environment variables remain the primary configuration path in CI.
  }
}

function readPngDimensions(bytes) {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) throw new Error('Reference sample is not a PNG file.');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
