import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root = resolve('.');
const temp = await mkdtemp(join(tmpdir(), 'craftaib-browser-'));
const env = { ...process.env, PORT: '0', CRAFTAIB_PUBLIC_DIR: resolve('dist') };
for (const key of Object.keys(env)) if (/^CRAFTAIB_(MODEL|TEXT|VISION|OIDC|ADMIN|ALLOWED)/.test(key)) env[key] = '';
const server = spawn(process.execPath, [resolve('scripts/server.mjs')], { cwd: temp, env, stdio: ['ignore', 'pipe', 'inherit'] });
try {
  const base = await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser fixture server did not start in 15 seconds.')), 15000);
    server.stdout.on('data', (chunk) => {
      const url = /http:\/\/127\.0\.0\.1:\d+/.exec(chunk.toString())?.[0];
      if (url) { clearTimeout(timer); resolveReady(url); }
    });
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Fixture server exited (${code}).`)); });
  });
  const tests = ['architect-ui-smoke.mjs', 'ai-generation-browser-smoke.mjs', 'ui-button-smoke.mjs', 'ui-file-action-smoke.mjs', 'viewer-region-browser-smoke.mjs', 'responsive-browser-smoke.mjs', 'viewer-performance-smoke.mjs'];
  for (const test of tests) {
    console.log(`Browser suite: ${test}`);
    await new Promise((resolveTest, reject) => {
      const child = spawn(process.execPath, [join(root, 'scripts', test)], { cwd: root, env: { ...env, CRAFTAIB_PREVIEW_URL: base, CRAFTAIB_ARCHITECT_URL: base }, stdio: 'inherit' });
      const timer = setTimeout(() => { child.kill(); reject(new Error(`${test} exceeded its 180 second budget.`)); }, 180000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolveTest() : reject(new Error(`${test} failed (${code}).`)); });
    });
  }
  console.log(`Browser suite passed: ${tests.length} fixture suites; no live model requests.`);
} finally {
  if (server.exitCode === null) {
    const stopped = new Promise((done) => server.once('exit', done));
    server.kill();
    await stopped;
  }
  await rm(temp, { recursive: true, force: true });
}
