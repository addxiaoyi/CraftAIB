import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { planBuilding } from '../packages/ai-planner/dist/index.js';

let upstreamAuth = null;
const plan = planBuilding({ prompt: 'small stone house', seed: 17 });
const upstream = createServer((request, response) => {
  upstreamAuth = request.headers.authorization;
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }));
});
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const upstreamPort = upstream.address().port;
const child = spawn(process.execPath, ['scripts/server.mjs'], {
  env: { ...process.env, PORT: '0', CRAFTAIB_TEXT_API_URL: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`, CRAFTAIB_TEXT_API_KEY: 'smoke-secret', CRAFTAIB_TEXT_MODEL: 'mock-text', CRAFTAIB_VISION_API_URL: '', CRAFTAIB_VISION_API_KEY: '', CRAFTAIB_VISION_MODEL: '' },
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
  assert.deepEqual({ ok: config.ok, text: config.text, vision: config.vision, model: config.textModel }, { ok: true, text: true, vision: false, model: 'mock-text' });
  assert.equal(JSON.stringify(config).includes('smoke-secret'), false, 'status must not expose API credentials');

  const invalid = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: '' }) });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_INPUT');

  const missing = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'a small stone house', referenceImage: { dataUrl: 'bad' } }) });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, 'INVALID_IMAGE');

  const noVision = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'a house', referenceImage: { dataUrl: 'data:image/png;base64,aGVsbG8=' } }) });
  assert.equal(noVision.status, 503);
  assert.equal((await noVision.json()).error.code, 'MODEL_NOT_CONFIGURED');

  const generated = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'small stone house', seed: 17, constraints: { floors: 2, width: 24, length: 20 } }) });
  assert.equal(generated.status, 200);
  const output = await generated.json();
  assert.equal(output.ok, true);
  assert.equal(output.plan.version, 1);
  assert.equal(output.plan.regions.length > 0, true);
  assert.equal(upstreamAuth, 'Bearer smoke-secret');
  assert.equal(JSON.stringify(output).includes('smoke-secret'), false, 'model credentials must not be included in planner output');
  const saved = await fetch(`${base}/api/ai/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: { endpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`, model: 'mock-text', apiKey: 'new-secret', timeoutMs: 5000, retries: 2 }, vision: { endpoint: '', model: '', apiKey: '', timeoutMs: 5000, retries: 0 } }) });
  assert.equal(saved.status, 200);
  assert.equal(JSON.stringify(await saved.json()).includes('new-secret'), false, 'config response must not expose API credentials');
  console.log('server smoke passed');
} finally {
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  await new Promise((resolve) => upstream.close(resolve));
}
