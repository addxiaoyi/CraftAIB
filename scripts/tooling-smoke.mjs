import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { loadConfigFromFile } from 'vite';
import { launchTestBrowser } from './lib/browser.mjs';
import { assertBrowserBuild } from './lib/browser-build.mjs';

const root = resolve('.');

function setEnv(context, key, value) {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  context.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

test('browser launcher delegates headless-shell discovery to Playwright on every platform', async (context) => {
  setEnv(context, 'CRAFTAIB_CHROMIUM_PATH', undefined);
  const browser = { close: async () => {} };
  const launch = context.mock.method(chromium, 'launch', async (options) => {
    assert.equal(options.headless, true);
    assert.equal(options.executablePath, undefined);
    return browser;
  });
  assert.equal(await launchTestBrowser(), browser);
  assert.equal(launch.mock.callCount(), 1);
});

test('browser launcher honors an explicit executable and rejects an invalid override', async (context) => {
  setEnv(context, 'CRAFTAIB_CHROMIUM_PATH', process.execPath);
  const launch = context.mock.method(chromium, 'launch', async (options) => options);
  assert.equal((await launchTestBrowser()).executablePath, process.execPath);
  process.env.CRAFTAIB_CHROMIUM_PATH = join(tmpdir(), 'craftaib-does-not-exist', 'browser');
  await assert.rejects(launchTestBrowser(), /CRAFTAIB_CHROMIUM_PATH does not exist/);
  assert.equal(launch.mock.callCount(), 1);
});

test('browser launcher preserves real browser failures instead of masking them as missing installs', async (context) => {
  setEnv(context, 'CRAFTAIB_CHROMIUM_PATH', undefined);
  const failure = new Error('Browser process crashed during startup');
  context.mock.method(chromium, 'launch', async () => { throw failure; });
  await assert.rejects(launchTestBrowser(), (error) => error === failure);
});

test('Vite API proxy follows the configured API port and explicit target override', async (context) => {
  setEnv(context, 'CRAFTAIB_API_PORT', '45123');
  setEnv(context, 'CRAFTAIB_API_TARGET', undefined);
  const configured = await loadConfigFromFile({ command: 'serve', mode: 'development' }, resolve(root, 'vite.config.ts'));
  assert.equal(configured.config.server.proxy['/api'].target, 'http://127.0.0.1:45123');
  process.env.CRAFTAIB_API_TARGET = 'http://127.0.0.1:45124';
  const overridden = await loadConfigFromFile({ command: 'serve', mode: 'development' }, resolve(root, 'vite.config.ts'));
  assert.equal(overridden.config.server.proxy['/api'].target, 'http://127.0.0.1:45124');
});

async function launchDetached(cwd, port) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('CRAFTAIB_')));
  const child = spawn(process.execPath, [resolve(root, 'scripts/start-server-detached.mjs')], {
    cwd,
    env: { ...env, PORT: String(port), CRAFTAIB_PUBLIC_DIR: resolve(cwd, 'public'), CRAFTAIB_START_TIMEOUT_MS: '10000' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return new Promise((fulfill, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Detached launcher did not exit within 15 seconds.')); }, 15000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); fulfill({ code, stdout, stderr }); });
  });
}

async function temporaryWorkspace(context) {
  const cwd = await mkdtemp(join(tmpdir(), 'craftaib-tooling-'));
  context.after(async () => {
    assert.equal(dirname(cwd), resolve(tmpdir()));
    await rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return cwd;
}

test('browser verification rejects missing or stale shipped Workers', async (context) => {
  const cwd = await temporaryWorkspace(context);
  await assert.rejects(assertBrowserBuild(cwd), /Browser build artifact cannot be read/);
  const paths = ['dist/index.html', 'packages/engine-worker/dist/browser/browser-worker.js', 'frontend/public/engine-worker.js', 'dist/engine-worker.js'];
  for (const path of paths) {
    await mkdir(dirname(resolve(cwd, path)), { recursive: true });
    await writeFile(resolve(cwd, path), path.endsWith('.html') ? '<!doctype html>' : 'worker-current');
  }
  await assertBrowserBuild(cwd);
  await writeFile(resolve(cwd, 'dist/engine-worker.js'), 'worker-old');
  await assert.rejects(assertBrowserBuild(cwd), /outdated engine Worker/);
});

test('detached startup reports readiness only after its independent server responds', async (context) => {
  const cwd = await temporaryWorkspace(context);
  await mkdir(resolve(cwd, 'public'));
  await writeFile(resolve(cwd, 'public/index.html'), '<!doctype html><title>CraftAIB fixture</title>');
  await writeFile(resolve(cwd, 'public/engine-worker.js'), 'self.onmessage = () => {};');
  const launch = await launchDetached(cwd, 0);
  const ready = /ready at (http:\/\/127\.0\.0\.1:\d+) \(pid (\d+)\)\. Log: (.+)/.exec(launch.stdout);
  let pid;
  try {
    assert.equal(launch.code, 0, launch.stderr);
    assert.ok(ready, launch.stdout);
    pid = Number(ready[2]);
    const response = await fetch(`${ready[1]}/api/ai/status`, { signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.ok, true);
    assert.equal(status.text, false);
    const log = await readFile(ready[3].trim(), 'utf8');
    assert.ok(log.includes(`CraftAIB listening on ${ready[1]}`));
  } finally {
    if (pid) {
      process.kill(pid);
      await delay(200);
    }
  }
});

test('detached startup refuses to report a server with missing frontend artifacts as ready', async (context) => {
  const cwd = await temporaryWorkspace(context);
  const launch = await launchDetached(cwd, 0);
  assert.notEqual(launch.code, 0);
  assert.doesNotMatch(launch.stdout, /detached server ready/);
  assert.match(launch.stderr, /Frontend asset \/ is unavailable/);
});

test('detached startup exits unsuccessfully for an occupied port and keeps the existing listener intact', async (context) => {
  const cwd = await temporaryWorkspace(context);
  const listener = createServer((_, response) => response.end('existing listener'));
  await new Promise((fulfill) => listener.listen(0, '127.0.0.1', fulfill));
  try {
    const port = listener.address().port;
    const launch = await launchDetached(cwd, port);
    assert.notEqual(launch.code, 0);
    assert.doesNotMatch(launch.stdout, /detached server ready/);
    assert.match(launch.stderr, /detached startup failed/);
    const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(2000) });
    assert.equal(await response.text(), 'existing listener');
  } finally {
    await new Promise((fulfill, reject) => listener.close((error) => error ? reject(error) : fulfill()));
  }
});
