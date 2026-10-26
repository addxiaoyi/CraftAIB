import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { PNG } from 'pngjs';
import { analyzeReferencePixels, compareReferenceFrontMask, structurePlanToGrid, structurePlanToRegionGrids } from '../packages/ai-planner/dist/index.js';
import { serializeLitematicaRegions } from '../packages/cartographer-adapter/dist/index.js';
import { parseLitematicaDocumentBytes, parseSchematicBytes, serializeSchematic, summarizeLitematicaDocument } from '../packages/craftmatic-adapter/dist/index.js';
import { renderVoxelReview } from './lib/voxel-preview.mjs';

// Exercise the same configured server, proxy, tool loop and renderer as the UI.
const base = process.env.CRAFTAIB_PREVIEW_URL || 'http://127.0.0.1:4183/';
const status = await fetch(new URL('/api/ai/status', base), { signal: AbortSignal.timeout(5000) });
assert.equal(status.status, 200, 'start the local server before running live generation');
assert.equal((await status.json()).text, true, 'configure a unified model before running live generation');
const names = (process.env.CRAFTAIB_REFERENCE_IMAGES || 'example1.png,example2.png,example3.png,example4.png').split(',').map((name) => name.trim()).filter(Boolean);
const output = resolve(process.env.CRAFTAIB_VISION_OUTPUT_DIR || 'outputs/vision-live');
await mkdir(output, { recursive: true });
const reports = [];
for (const name of names) {
  assert.equal(name, basename(name), 'sample must be a filename within examples/');
  const log = [];
  const logPath = resolve(output, `${name}.events.jsonl`);
  await writeFile(logPath, '');
  const startedAt = Date.now();
  try {
    const image = await readFile(resolve('examples', name));
    const decoded = PNG.sync.read(image);
    const features = analyzeReferencePixels({ width: decoded.width, height: decoded.height, pixels: decoded.data });
    const response = await fetch(new URL('/api/ai/structure-plan?stream=1', base), {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, signal: AbortSignal.timeout(930000),
      body: JSON.stringify({ prompt: process.env.CRAFTAIB_VISION_PROMPT || 'Reconstruct the pictured subject faithfully in three dimensions. Let the original image determine its identity, proportions, materials, symmetry and details. Infer consistent hidden geometry from visible evidence.', seed: 42, constraints: { detailLevel: 4, includeInterior: true, sizeMode: 'envelope' }, referenceImage: { width: decoded.width, height: decoded.height, sourceName: name, dataUrl: `data:image/png;base64,${image.toString('base64')}`, referenceFeatures: features } }),
    });
    assert.equal(response.status, 200, `generation request rejected: HTTP ${response.status}`);
    const payload = await readEvents(response, async (entry) => {
      log.push(entry);
      await appendFile(logPath, `${JSON.stringify(entry)}\n`);
      console.log(`${name}: T${entry.turn ?? 0} ${entry.stage} ${entry.tool ?? ''} ${entry.message ?? ''}`);
    });
    if (!payload?.ok) throw Object.assign(new Error(payload?.error?.message || 'No final generation result.'), { code: payload?.error?.code });
    const plan = payload.plan;
    const grid = structurePlanToGrid(plan);
    const regions = structurePlanToRegionGrids(plan);
    assert.ok(grid.cells.length > 0);
    const litematic = await serializeLitematicaRegions(regions, { name: plan.name, author: 'CraftAIB', description: `Live unified-model reconstruction: ${name}` });
    const document = await parseLitematicaDocumentBytes(litematic);
    assert.equal(document.regions.length, regions.length);
    const expected = canonicalCells(grid.cells);
    assert.deepEqual(canonicalCells(document.regions.flatMap((region) => region.cells)), expected, 'Litematic must preserve every world coordinate and block state');
    assert.deepEqual(document.regions.map((region) => ({ name: region.name, position: region.position, dimensions: region.dimensions })), regions.map((region) => ({ name: region.name, position: region.position, dimensions: { x: region.grid.width, y: region.grid.height, z: region.grid.length } })));
    const schem = await serializeSchematic(grid);
    const roundTrip = await parseSchematicBytes(schem);
    assert.deepEqual(canonicalCells(roundTrip.cells), expected, 'Schematic must preserve every coordinate and block state');
    assert.deepEqual([roundTrip.width, roundTrip.height, roundTrip.length], [grid.width, grid.height, grid.length]);
    await writeFile(resolve(output, `${name}.litematic`), litematic);
    await writeFile(resolve(output, `${name}.schem`), schem);
    await writeFile(resolve(output, `${name}.plan.json`), JSON.stringify(plan, null, 2));
    await writeFile(resolve(output, `${name}.views.png`), Buffer.from(renderVoxelReview(grid, plan.referenceFacing).split(',')[1], 'base64'));
    reports.push({ image: name, ok: true, elapsedMs: Date.now() - startedAt, blocks: grid.cells.length, regions: summarizeLitematicaDocument(document).regions, referenceMatch: compareReferenceFrontMask(plan, grid.cells), visualReview: log.filter((entry) => entry.tool === 'review_reference_structure'), roundTrip: { exactCoordinates: true, exactBlockStates: true }, seaLanterns: grid.cells.filter((cell) => cell.block.id === 'minecraft:sea_lantern').map(({ x, y, z }) => ({ x, y, z })) });
  } catch (error) {
    reports.push({ image: name, ok: false, elapsedMs: Date.now() - startedAt, error: { code: error.code || 'LIVE_VERIFICATION_FAILED', message: error.message }, events: log.length });
  }
  await writeFile(resolve(output, `${name}.report.json`), JSON.stringify(reports.at(-1), null, 2));
}
await writeFile(resolve(output, 'summary.json'), JSON.stringify({ ok: reports.every((report) => report.ok), reports }, null, 2));
console.log(JSON.stringify({ output, reports }, null, 2));
if (reports.some((report) => !report.ok)) process.exitCode = 1;

function canonicalCells(cells) {
  return cells.map((cell) => `${cell.x},${cell.y},${cell.z}:${cell.block.id}:${JSON.stringify(Object.entries(cell.block.properties ?? {}).sort(([left], [right]) => left.localeCompare(right)))}`).sort();
}

async function readEvents(response, onProgress) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let payload;
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value, { stream: !chunk.done });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      const json = /^data: (.+)$/m.exec(frame)?.[1];
      if (!json) continue;
      const parsed = JSON.parse(json);
      if (event === 'progress') await onProgress(parsed);
      if (event === 'result') payload = parsed.payload;
    }
    if (chunk.done) break;
  }
  return payload;
}
