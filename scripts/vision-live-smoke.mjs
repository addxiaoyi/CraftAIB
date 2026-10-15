import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { planBuildingWithVision, structurePlanToRegionGrids } from '../packages/ai-planner/dist/index.js';
import { serializeLitematicaRegions } from '../packages/cartographer-adapter/dist/index.js';
import { parseLitematicaDocumentBytes, summarizeLitematicaDocument } from '../packages/craftmatic-adapter/dist/index.js';

const endpoint = process.env.CRAFTAIB_VISION_API_URL;
if (!endpoint) {
  console.log('VISION_LIVE_SMOKE_SKIPPED: set CRAFTAIB_VISION_API_URL to run a real endpoint test.');
  process.exit(0);
}
const imagePath = resolve(process.env.CRAFTAIB_REFERENCE_IMAGE ?? 'examples/example1.png');
const image = await readFile(imagePath);
const dataUrl = `data:image/png;base64,${image.toString('base64')}`;
const plan = await planBuildingWithVision({ prompt: process.env.CRAFTAIB_VISION_PROMPT ?? 'Turn this reference into a buildable Minecraft building with facade, roof, rooms, courtyard, and tower regions.', seed: 42, referenceImage: { width: 1, height: 1, dataUrl } }, { endpoint, apiKey: process.env.CRAFTAIB_VISION_API_KEY, model: process.env.CRAFTAIB_VISION_MODEL, maxRetries: 2 });
const regions = structurePlanToRegionGrids(plan);
assert.ok(regions.length > 0);
const bytes = await serializeLitematicaRegions(regions, { name: plan.name, author: 'CraftAIB', description: 'Live vision endpoint smoke.' });
const document = await parseLitematicaDocumentBytes(bytes);
assert.equal(document.regions.length, regions.length);
await mkdir('outputs', { recursive: true });
const output = resolve(process.env.CRAFTAIB_VISION_OUTPUT ?? 'outputs/vision-live.litematic');
await writeFile(output, bytes);
console.log(JSON.stringify({ ok: true, output, type: plan.type, style: plan.style, regions: summarizeLitematicaDocument(document).regions }, null, 2));
