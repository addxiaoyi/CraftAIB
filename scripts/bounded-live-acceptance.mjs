import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { blockStateKey, stringifyEngineJson, validateGrid } from '../packages/core/dist/index.js';
import { serializeLitematica } from '../packages/cartographer-adapter/dist/index.js';
import { parseLitematicaBytes, parseSchematicBytes, serializeSchematic } from '../packages/craftmatic-adapter/dist/index.js';
import { renderVoxelReview } from './lib/voxel-preview.mjs';

const output = resolve(process.env.CRAFTAIB_LIVE_OUTPUT || 'outputs/model-live');
await mkdir(output, { recursive: true });
const prompt = 'Build a small medieval timber cottage, at most 17 blocks wide, 14 high and 17 deep. Include a stone foundation, timber framing, a pitched blackstone-stair roof, glass windows, one usable two-block-high open entrance and a hollow interior. Keep it under 3000 occupied blocks and 8000 block writes. Put the entrance on the north side. Use explicit directional block states for stairs and logs, and use only the supplied block catalog. Leave the entrance open because door blocks are outside this catalog. Do not add terrain, trees or surrounding buildings.';
const limits = { requests: 2, requestTimeoutMs: 90_000, totalTimeoutMs: 185_000, blockWrites: 10_000 };
const server = spawn(process.execPath, [resolve('scripts/server.mjs')], {
  cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '0', CRAFTAIB_MODEL_TIMEOUT_MS: String(limits.requestTimeoutMs),
    CRAFTAIB_MODEL_MAX_RETRIES: '0', CRAFTAIB_BUILDER_REPAIR_ATTEMPTS: '1',
    CRAFTAIB_MAX_GENERATED_BLOCKS: String(limits.blockWrites) },
});
const serverMessages = [];
server.stderr.on('data', (chunk) => serverMessages.push(chunk.toString()));
const report = { startedAt: new Date().toISOString(), scenario: 'timber-cottage', limits, prompt, ok: false };
const events = [];
const started = Date.now();
try {
  const base = await new Promise((fulfill, reject) => {
    const timer = setTimeout(() => reject(new Error('Temporary acceptance server did not start in 15 seconds.')), 15_000);
    let stdout = '';
    server.stdout.on('data', (chunk) => {
      stdout += chunk;
      const url = /http:\/\/127\.0\.0\.1:\d+/.exec(stdout)?.[0];
      if (url) { clearTimeout(timer); fulfill(url); }
    });
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Acceptance server exited (${code}).`)); });
  });
  const status = await fetch(`${base}/api/ai/status`, { signal: AbortSignal.timeout(5000) });
  assert.equal(status.status, 200);
  const config = await status.json();
  assert.equal(config.text, true, 'A real model must be configured in .env or the environment.');
  report.model = config.generationModel;
  report.thinking = config.thinking;
  const response = await fetch(`${base}/api/ai/structure-plan?stream=1`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ mode: 'builder', prompt, seed: 42, constraints: { includeInterior: true } }),
    signal: AbortSignal.timeout(limits.totalTimeoutMs),
  });
  assert.equal(response.status, 200, `Generation rejected: HTTP ${response.status}`);
  const payload = await readEvents(response, (entry) => {
    events.push(entry);
    console.log(`${entry.stage}: ${entry.message ?? ''}`);
  });
  if (!payload?.ok) throw Object.assign(new Error(payload?.error?.message ?? 'No final build received.'), { code: payload?.error?.code ?? 'NO_RESULT' });
  const grid = validateGrid(payload.grid);
  const stateKeys = (cells) => cells.map((cell) => `${cell.x},${cell.y},${cell.z}:${blockStateKey(cell.block)}`).sort();
  const expected = stateKeys(grid.cells);
  const litematic = await serializeLitematica(grid, { name: payload.plan.name, author: 'CraftAIB live acceptance' });
  const schematic = await serializeSchematic(grid);
  const imported = await parseLitematicaBytes(litematic);
  assert.deepEqual(stateKeys(imported.cells), expected);
  assert.deepEqual(imported.origin, grid.origin);
  assert.deepEqual(stateKeys((await parseSchematicBytes(schematic)).cells), expected);
  const counts = {};
  for (const cell of grid.cells) counts[cell.block.id] = (counts[cell.block.id] ?? 0) + 1;
  const countMatching = (pattern) => grid.cells.filter((cell) => pattern.test(cell.block.id)).length;
  const occupied = new Set(grid.cells.map((cell) => `${cell.x},${cell.y},${cell.z}`));
  let interiorAir = 0;
  for (let y = 2; y < Math.min(grid.height - 2, 5); y += 1) {
    for (let z = 2; z < grid.length - 2; z += 1) for (let x = 2; x < grid.width - 2; x += 1) {
      if (!occupied.has(`${x},${y},${z}`)) interiorAir += 1;
    }
  }
  const quality = {
    boundedSize: grid.width <= 17 && grid.height <= 14 && grid.length <= 17,
    boundedBlockCount: grid.cells.length >= 100 && grid.cells.length <= 3000,
    variedMaterials: Object.keys(counts).length >= 5,
    stoneFoundation: countMatching(/stone|cobble/) > 0,
    timber: countMatching(/_log$|_wood$/) > 0,
    glassWindows: countMatching(/glass/) > 0,
    directionalRoof: grid.cells.some((cell) => /blackstone.*stairs$/.test(cell.block.id) && cell.block.properties?.facing),
    openNorthEntrance: Array.from({ length: Math.max(0, grid.width - 2) }, (_, x) => x + 1).some((x) => [0, 1].some((z) => occupied.has(`${x},0,${z}`) && !occupied.has(`${x},1,${z}`) && !occupied.has(`${x},2,${z}`))),
    interiorAir: interiorAir >= 16,
  };
  const artifacts = {
    'cottage.litematic': litematic, 'cottage.schem': schematic,
    'cottage.grid.json': Buffer.from(stringifyEngineJson(grid, 2)),
    'cottage.plan.json': Buffer.from(JSON.stringify(payload.plan, null, 2)),
    'cottage.views.png': Buffer.from(renderVoxelReview(grid).split(',')[1], 'base64'),
  };
  report.files = [];
  for (const [name, bytes] of Object.entries(artifacts)) {
    await writeFile(resolve(output, name), bytes);
    report.files.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  Object.assign(report, { blocks: grid.cells.length, dimensions: { width: grid.width, height: grid.height, length: grid.length },
    materials: counts, quality, interiorAir, modelCalls: 1 + events.filter((entry) => entry.stage === 'builder_retry').length,
    roundTrip: { exactCoordinates: true, exactBlockStates: true, litematicOrigin: true }, visualReview: 'pending' });
  assert.ok(Object.values(quality).every(Boolean), `Quality gates failed: ${Object.entries(quality).filter(([, pass]) => !pass).map(([name]) => name).join(', ')}`);
  report.ok = true;
} catch (error) {
  report.error = { code: error.code ?? error.name, message: error.message };
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) {
    const stopped = new Promise((done) => server.once('exit', done));
    server.kill();
    await stopped;
  }
  report.elapsedMs = Date.now() - started;
  report.serverWarningCount = serverMessages.length;
  await writeFile(resolve(output, 'events.jsonl'), events.map((entry) => JSON.stringify(entry)).join('\n'));
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, ...report }, null, 2));
}

async function readEvents(response, onProgress) {
  const decoder = new TextDecoder();
  let buffer = '';
  let payload;
  for await (const bytes of response.body) {
    buffer += decoder.decode(bytes, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      const json = /^data: (.+)$/m.exec(frame)?.[1];
      if (!json) continue;
      const parsed = JSON.parse(json);
      if (event === 'progress') onProgress(parsed);
      if (event === 'result' || event === 'failure') payload = parsed.payload;
    }
  }
  return payload;
}
