import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { planBuildingWithVision, structurePlanToRegionGrids } from '../packages/ai-planner/dist/index.js';
import { serializeLitematicaRegions } from '../packages/cartographer-adapter/dist/index.js';
import { parseLitematicaDocumentBytes, parseSchematicBytes, serializeSchematic, summarizeLitematicaDocument } from '../packages/craftmatic-adapter/dist/index.js';

const endpoint = process.env.CRAFTAIB_MODEL_API_URL || process.env.CRAFTAIB_VISION_API_URL;
if (!endpoint) { console.log('VISION_LIVE_SMOKE_SKIPPED: configure CRAFTAIB_MODEL_API_URL or CRAFTAIB_VISION_API_URL first.'); process.exit(0); }
const imageNames = (process.env.CRAFTAIB_REFERENCE_IMAGES || 'example1.png,example2.png,example3.png,example4.png').split(',').map((name) => name.trim()).filter(Boolean);
const outputDir = resolve(process.env.CRAFTAIB_VISION_OUTPUT_DIR || 'outputs/vision-live');
await mkdir(outputDir, { recursive: true });
const results = [];
for (const imageName of imageNames) {
  const image = await readFile(resolve('examples', imageName));
  const dataUrl = `data:image/png;base64,${image.toString('base64')}`;
  const plan = await planBuildingWithVision({ prompt: process.env.CRAFTAIB_VISION_PROMPT ?? 'Strictly reconstruct this reference image as a buildable Minecraft structure. Preserve silhouette, proportions, floors, roof, windows, towers, courtyard, facade materials, and distinctive landmarks.', seed: 42, referenceImage: { width: 1, height: 1, dataUrl } }, { endpoint, apiKey: process.env.CRAFTAIB_MODEL_API_KEY || process.env.CRAFTAIB_VISION_API_KEY, model: process.env.CRAFTAIB_MODEL || process.env.CRAFTAIB_VISION_MODEL, maxRetries: 2 });
  const regions = structurePlanToRegionGrids(plan);
  assert.ok(regions.length > 0);
  const litematicBytes = await serializeLitematicaRegions(regions, { name: plan.name, author: 'CraftAIB', description: `Live vision smoke: ${imageName}` });
  const document = await parseLitematicaDocumentBytes(litematicBytes);
  assert.equal(document.regions.length, regions.length);
  const merged = regions.flatMap((region) => region.grid.cells);
  const grid = { version: 1, width: plan.dimensions.width, height: plan.dimensions.height, length: plan.dimensions.length, cells: merged, palette: [{ id: 'minecraft:air' }, ...merged.map((cell) => cell.block)], coordinateSystem: 'xyz', origin: { x: 0, y: 0, z: 0 } };
  const schemBytes = await serializeSchematic(grid);
  await writeFile(resolve(outputDir, `${imageName}.litematic`), litematicBytes);
  await writeFile(resolve(outputDir, `${imageName}.schem`), schemBytes);
  const schemRoundTrip = await parseSchematicBytes(schemBytes);
  assert.ok(schemRoundTrip.cells.length > 0);
  results.push({ image: imageName, type: plan.type, style: plan.style, inference: plan.inference, regions: summarizeLitematicaDocument(document).regions, blocks: schemRoundTrip.cells.length });
}
console.log(JSON.stringify({ ok: true, outputDir, results }, null, 2));
