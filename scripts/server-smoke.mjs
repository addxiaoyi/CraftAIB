import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { planBuilding } from '../packages/ai-planner/dist/index.js';

let upstreamAuth = null;
let upstreamMode = 'success';
let upstreamCalls = 0;
const plan = planBuilding({ prompt: 'small stone house', seed: 17 });
const upstream = createServer((request, response) => {
  upstreamAuth = request.headers.authorization;
  upstreamCalls += 1;
  if (upstreamMode === 'rate') {
    response.writeHead(429, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'busy' } }));
    return;
  }
  if (upstreamMode === 'slow') {
    setTimeout(() => { if (!response.destroyed) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] })); } }, 1800);
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }));
});
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const upstreamPort = upstream.address().port;
const testCwd = await mkdtemp(join(tmpdir(), 'craftaib-server-smoke-'));
const child = spawn(process.execPath, [resolve('scripts/server.mjs')], {
  cwd: testCwd,
  env: { ...process.env, PORT: '0', CRAFTAIB_PUBLIC_DIR: resolve('dist'), CRAFTAIB_ADMIN_TOKEN: 'admin-secret', CRAFTAIB_MODEL_API_URL: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`, CRAFTAIB_MODEL_API_KEY: 'smoke-secret', CRAFTAIB_MODEL: 'mock-text', CRAFTAIB_MODEL_TIMEOUT_MS: '5000', CRAFTAIB_MODEL_MAX_RETRIES: '1', CRAFTAIB_TEXT_API_URL: '', CRAFTAIB_TEXT_API_KEY: '', CRAFTAIB_TEXT_MODEL: '', CRAFTAIB_VISION_API_URL: '', CRAFTAIB_VISION_API_KEY: '', CRAFTAIB_VISION_MODEL: '' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const base = await new Promise((resolve, reject) => {
  child.stdout.on('data', (chunk) => {
    const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(chunk.toString());
    if (match) resolve(`http://127.0.0.1:${match[1]}`);
  });
  child.once('error', reject);
  child.once('exit', (code) => reject(new Error(`Server exited before listening (${code}).`)));
});

try {
  let status;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { status = await fetch(`${base}/api/ai/status`); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  assert.ok(status, 'server should start');
  const config = await status.json();
  assert.deepEqual({ ok: config.ok, text: config.text, vision: config.vision, model: config.textModel }, { ok: true, text: true, vision: true, model: 'mock-text' });
  assert.equal(JSON.stringify(config).includes('smoke-secret'), false, 'status must not expose API credentials');

  const invalid = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: '' }) });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_INPUT');

  const missing = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'a small stone house', referenceImage: { dataUrl: 'bad' } }) });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, 'INVALID_IMAGE');

  const generated = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'small stone house', seed: 17, constraints: { floors: 2, width: 24, length: 20 } }) });
  assert.equal(generated.status, 200);
  const output = await generated.json();
  assert.equal(output.ok, true);
  assert.equal(output.plan.version, 1);
  assert.equal(output.plan.regions.length > 0, true);
  assert.equal(upstreamAuth, 'Bearer smoke-secret');
  assert.equal(JSON.stringify(output).includes('smoke-secret'), false, 'model credentials must not be included in planner output');
  const unauthorized = await fetch(`${base}/api/ai/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ generation: {} }) });
  assert.equal(unauthorized.status, 403);
  assert.equal((await unauthorized.json()).error.code, 'FORBIDDEN');
  const saved = await fetch(`${base}/api/ai/config`, { method: 'POST', headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }, body: JSON.stringify({ generation: { endpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`, model: 'mock-text', apiKey: 'new-secret', timeoutMs: 5000, retries: 2 }, vision: { endpoint: '', model: '', apiKey: '', timeoutMs: 5000, retries: 0 } }) });
  assert.equal(saved.status, 200);
  assert.equal(JSON.stringify(await saved.json()).includes('new-secret'), false, 'config response must not expose API credentials');

  upstreamMode = 'rate';
  upstreamCalls = 0;
  const limited = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'small tower' }) });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
  assert.equal(upstreamCalls, 3, 'configured retries should be applied to 429 responses');

  const reconfigured = await fetch(`${base}/api/ai/config`, { method: 'POST', headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }, body: JSON.stringify({ generation: { endpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`, model: 'mock-text', apiKey: 'new-secret', timeoutMs: 1000, retries: 0 } }) });
  assert.equal(reconfigured.status, 200);
  upstreamMode = 'slow';
  const timedOut = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'small tower' }) });
  assert.equal(timedOut.status, 504);
  assert.equal((await timedOut.json()).error.code, 'MODEL_TIMEOUT');
  console.log('server smoke passed');
} finally {
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  await new Promise((resolve) => upstream.close(resolve));
  await rm(testCwd, { recursive: true, force: true });
}
