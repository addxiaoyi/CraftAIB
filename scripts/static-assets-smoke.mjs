import assert from 'node:assert/strict';
import { request, createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { withBrowserServer } from './lib/browser-server.mjs';

function download(base, path, headers = {}, method = 'GET') {
  return new Promise((fulfill, reject) => {
    const call = request(`${base}${path}`, { method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => fulfill({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }));
    });
    call.once('error', reject);
    call.end();
  });
}

test('production server compresses its actual material JSON without changing content', async () => {
  await withBrowserServer(async (base) => {
    const response = await download(base, '/lodestone-default-pack/assets.json', { 'accept-encoding': 'br, gzip' });
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-encoding'], 'br');
    assert.deepEqual(brotliDecompressSync(response.bytes), await readFile('dist/lodestone-default-pack/assets.json'));
  });
});

test('built compression is lossless and static delivery negotiates encodings safely', async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), 'craftaib-static-'));
  context.after(() => rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const publicRoot = join(workspace, 'public');
  const text = Buffer.from(JSON.stringify({ models: Array.from({ length: 1000 }, (_, index) => ({ id: index, texture: 'minecraft:block/stone' })) }));
  await mkdir(publicRoot);
  await writeFile(join(publicRoot, 'assets.json'), text);
  await writeFile(join(publicRoot, 'small.txt'), 'small asset');
  await writeFile(join(publicRoot, 'atlas.png'), Buffer.from([137, 80, 78, 71]));
  await writeFile(join(publicRoot, 'old.json'), text);
  await writeFile(join(publicRoot, 'identity.json'), text);
  const build = spawn(process.execPath, [resolve('scripts/compress-static.mjs'), publicRoot], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let buildLog = '';
  build.stdout.on('data', (chunk) => { buildLog += chunk; });
  build.stderr.on('data', (chunk) => { buildLog += chunk; });
  const buildExit = await new Promise((fulfill, reject) => { build.once('error', reject); build.once('close', fulfill); });
  assert.equal(buildExit, 0, buildLog);
  const br = await readFile(join(publicRoot, 'assets.json.br'));
  const gzip = await readFile(join(publicRoot, 'assets.json.gz'));
  assert.deepEqual(brotliDecompressSync(br), text);
  assert.deepEqual(gunzipSync(gzip), text);
  assert.ok(br.length < text.length / 10);
  await assert.rejects(readFile(join(publicRoot, 'small.txt.br')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(publicRoot, 'atlas.png.br')), { code: 'ENOENT' });
  await rm(join(publicRoot, 'identity.json.br'));
  await rm(join(publicRoot, 'identity.json.gz'));
  const stale = new Date(Date.now() - 60_000);
  await utimes(join(publicRoot, 'old.json.br'), stale, stale);
  await utimes(join(publicRoot, 'old.json.gz'), stale, stale);
  const { serveStatic } = await import('./lib/static-files.mjs');
  const server = createServer(async (request, response) => {
    if (await serveStatic(publicRoot, new URL(request.url, 'http://localhost').pathname, request, response)) return;
    response.writeHead(404).end();
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  context.after(() => new Promise((done, reject) => server.close((error) => error ? reject(error) : done())));
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const [accept, encoding] of [['br, gzip', 'br'], ['gzip;q=1, br;q=0.5', 'gzip'], ['br;q=0, gzip', 'gzip'], ['*;q=0.5', 'br'], ['br;q=0.5, identity;q=1', undefined], ['', undefined], ['identity', undefined]]) {
    const response = await download(base, '/assets.json', { 'accept-encoding': accept });
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-encoding'], encoding, accept);
    assert.equal(response.headers.vary, 'Accept-Encoding');
    assert.match(response.headers['content-type'], /application\/json/);
    assert.equal(Number(response.headers['content-length']), response.bytes.length);
    assert.deepEqual(encoding === 'br' ? brotliDecompressSync(response.bytes) : encoding === 'gzip' ? gunzipSync(response.bytes) : response.bytes, text);
  }
  const head = await download(base, '/assets.json', { 'accept-encoding': 'br' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-encoding'], 'br');
  assert.equal(Number(head.headers['content-length']), br.length);
  assert.equal(head.bytes.length, 0);
  for (const path of ['/old.json', '/identity.json']) {
    const response = await download(base, path, { 'accept-encoding': 'br, gzip' });
    assert.equal(response.headers['content-encoding'], undefined, path);
    assert.deepEqual(response.bytes, text);
  }
  const denied = await download(base, '/assets.json', { 'accept-encoding': 'br;q=0, gzip;q=0, identity;q=0' });
  assert.equal(denied.status, 406);
  assert.equal((await download(base, '/missing.json')).status, 404);
  assert.equal((await download(base, '/%2e%2e%2foutside.json')).status, 404);
  assert.equal((await download(base, '/%E0%A4%A')).status, 404);
});
