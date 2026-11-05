import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { launchTestBrowser } from './lib/browser.mjs';
import { withBrowserServer } from './lib/browser-server.mjs';

const baseline = process.argv.includes('--baseline');
const measureOnly = process.argv.includes('--measure-only');
const output = resolve(process.env.CRAFTAIB_LOADING_REPORT || 'outputs/renderer-loading/after.json');
await mkdir(dirname(output), { recursive: true });
const sampleCount = Number(process.env.CRAFTAIB_LOADING_SAMPLES || 1);
assert.ok(Number.isInteger(sampleCount) && sampleCount >= 1 && sampleCount <= 5, 'Use 1–5 cold loading samples.');
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const assetSizes = new Map();
for (const name of await readdir(resolve('dist/assets'))) {
  if (!name.endsWith('.js')) continue;
  const bytes = await readFile(resolve('dist/assets', name));
  assetSizes.set(`/assets/${name}`, { bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
}

function scriptsAt(requests) {
  const scripts = [...new Set(requests.filter((path) => assetSizes.has(path)))].sort();
  return {
    scripts,
    bytes: scripts.reduce((sum, path) => sum + assetSizes.get(path).bytes, 0),
    gzipBytes: scripts.reduce((sum, path) => sum + assetSizes.get(path).gzipBytes, 0),
  };
}

async function waitForTextured(page) {
  await page.waitForFunction(() => document.querySelector('[data-lodestone-status]')?.textContent?.includes('Minecraft resource pack ready'), null, { timeout: 30000 });
  await page.locator('canvas[data-lodestone-instance]').waitFor({ state: 'visible' });
}

async function measure(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  // Keep third-party texture latency out of this local JS loading comparison.
  await page.route('https://assets.mcasset.cloud/**', (route) => route.fulfill({ contentType: 'image/png', body: tinyPng }));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1_500_000 / 8, uploadThroughput: 750_000 / 8 });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ai-generate="true"]').waitFor({ state: 'visible' });
    await page.locator('textarea').first().fill('Renderer loading acceptance');
    const controlsReadyMs = Math.round(await page.evaluate(() => performance.now()));
    const controls = scriptsAt(requests);
    await waitForTextured(page);
    const texturedReadyMs = Math.round(await page.evaluate(() => performance.now()));
    const initial = scriptsAt(requests);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => /\/(assets\/|lodestone-default-pack\/)/.test(new URL(entry.name).pathname)).map((entry) => ({
      path: new URL(entry.name).pathname,
      startMs: Math.round(entry.startTime), durationMs: Math.round(entry.duration),
      transferBytes: entry.transferSize, encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize,
    })));
    if (!baseline) assert.ok(!initial.scripts.some((name) => /\/ThreeViewport-/.test(name)), 'Solid preview must wait until selected.');

    const switchStarted = await page.evaluate(() => performance.now());
    await page.locator('[data-ai-render-toggle="true"]').click();
    await page.locator('[data-ai-renderer="solid"] canvas').waitFor({ state: 'visible' });
    if (!baseline) await page.locator('[data-solid-status="ready"]').waitFor();
    await page.getByRole('button', { name: 'Reset Camera View', exact: true }).click();
    const solidReadyMs = Math.round(await page.evaluate(() => performance.now()) - switchStarted);
    const switched = scriptsAt(requests);
    await page.locator('[data-ai-render-toggle="true"]').click();
    await waitForTextured(page);
    const cached = scriptsAt(requests);
    if (!baseline) {
      for (const name of ['assets.json', 'atlas.png']) assert.equal(requests.filter((path) => path === `/lodestone-default-pack/${name}`).length, 1, `Switching renderers must reuse bundled ${name}.`);
    }
    assert.equal(cached.bytes, switched.bytes, 'Switching back must reuse renderer modules.');
    await page.locator('[data-workspace-id="settings"]').filter({ visible: true }).first().click();
    await page.locator('[data-active-workspace="settings"] select').first().waitFor();
    assert.deepEqual(errors, []);
    return { controlsReadyMs, texturedReadyMs, solidReadyMs, controls, initial, switched, resources, errors };
  } finally {
    await context.close();
  }
}

async function verifyRecovery(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await context.addInitScript(() => {
    localStorage.setItem('craftaib.auto-save', 'false');
    window.blockReloadSnapshot = true;
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'craftaib.reload-snapshot' && window.blockReloadSnapshot) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return save.call(this, key, value);
    };
  });
  let rejected = false;
  await page.route('**/assets/LodestoneViewport-*.js', async (route) => {
    if (rejected) return route.continue();
    rejected = true;
    await route.fulfill({ status: 503, contentType: 'text/javascript', body: 'Temporarily unavailable' });
  });
  try {
    await page.goto(base);
    await page.locator('[data-viewport-state="error"]').waitFor();
    await page.locator('textarea').first().fill('Keep this prompt during preview recovery');
    await page.locator('[data-viewport-retry="true"]').click();
    await page.locator('[data-viewport-recovery-error="true"]').waitFor();
    assert.equal(await page.locator('textarea').first().inputValue(), 'Keep this prompt during preview recovery');
    await page.evaluate(() => { window.blockReloadSnapshot = false; });
    await page.locator('[data-viewport-retry="true"]').click();
    await waitForTextured(page);
    assert.equal(await page.locator('textarea').first().inputValue(), 'Keep this prompt during preview recovery');
    assert.equal(await page.locator('[data-viewport-state="error"]').count(), 0);
    assert.ok(rejected, 'The test must reject an actual renderer request.');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('craftaib.reload-snapshot')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('craftaib.auto-save')), 'false');
    return { failedChunk: true, retryRecovered: true, promptPreserved: true, autoSaveDisabled: true, quotaPreventsReload: true };
  } finally {
    await context.close();
  }
}

async function verifyWorkspaceLoading(browser, base) {
  for (const workspace of ['settings', 'viewer_3d']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    page.on('pageerror', (error) => errors.push(error.message));
    await context.addInitScript((active) => localStorage.setItem('craftaib.active-workspace', active), workspace);
    await page.route('https://assets.mcasset.cloud/**', (route) => route.fulfill({ contentType: 'image/png', body: tinyPng }));
    try {
      await page.goto(base);
      const active = page.locator(`[data-active-workspace="${workspace}"]`);
      if (workspace === 'settings') {
        await active.locator('select').first().waitFor();
        assert.ok(!requests.some((name) => /\/(three-|ThreeViewport-|LodestoneViewport-)/.test(name)), 'Settings must not load 3D libraries.');
      } else {
        await active.locator('canvas').waitFor({ state: 'visible' });
        assert.ok(!requests.some((name) => /\/LodestoneViewport-/.test(name)), 'Native inspector must not load textured preview code.');
        await page.locator('[data-renderer-mode="native"]').click();
        await waitForTextured(page);
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  return { settingsWithout3d: true, nativeWithoutLodestone: true, viewerSwitch: true };
}

async function verifyPackRecovery(browser, base, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  let rejected = false;
  await page.route('**/lodestone-default-pack/assets.json', async (route) => {
    if (rejected) return route.continue();
    rejected = true;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  try {
    await page.goto(base);
    await page.locator('[data-lodestone-status="error"]').waitFor();
    assert.equal(await page.locator('[data-lodestone-status="ready"]').count(), 0);
    await page.screenshot({ path: resolve(dirname(output), `resource-pack-error-${viewport.width}.png`) });
    await page.locator('[data-resource-pack-retry="true"]').click();
    await waitForTextured(page);
    assert.ok(rejected, 'The test must reject an actual resource-pack request.');
    return { width: viewport.width, failedPack: true, readyOnlyAfterLoad: true, retryRecovered: true };
  } finally {
    await context.close();
  }
}

async function run(base) {
  const browser = await launchTestBrowser();
  try {
    const samples = [];
    for (let index = 0; index < sampleCount; index += 1) {
      samples.push(await measure(browser, base));
      console.log(`Renderer loading sample ${index + 1}/${sampleCount} complete.`);
    }
    const recovery = baseline || measureOnly ? null : await verifyRecovery(browser, base);
    const workspaces = baseline || measureOnly ? null : await verifyWorkspaceLoading(browser, base);
    const resourcePack = [];
    if (!baseline && !measureOnly) {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
        resourcePack.push(await verifyPackRecovery(browser, base, viewport));
      }
    }
    const largestChunks = [...assetSizes].map(([path, sizes]) => ({ path, ...sizes })).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    if (!baseline) assert.ok(largestChunks[0].bytes < 500_000, 'Keep production JS chunks below the existing 500 kB warning threshold.');
    const report = {
      baseline, platform: process.platform, node: process.version, browser: browser.version(),
      network: { downloadBitsPerSecond: 1_500_000, latencyMs: 40, coldCache: true, thirdPartyTexturesStubbed: true },
      note: 'JS byte totals describe decoded files; calculated gzip sizes are estimates. Resource entries record actual browser transfer, encoded and decoded sizes. Timing is a local headless measurement.',
      samples, recovery, workspaces, resourcePack, largestChunks,
    };
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ report: output, samples: samples.map(({ controlsReadyMs, texturedReadyMs, solidReadyMs, initial }) => ({ controlsReadyMs, texturedReadyMs, solidReadyMs, initialBytes: initial.bytes })), recovery, largestChunkBytes: largestChunks[0].bytes }, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.env.CRAFTAIB_PREVIEW_URL) await run(process.env.CRAFTAIB_PREVIEW_URL);
else await withBrowserServer(run);
