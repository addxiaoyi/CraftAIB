import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { resolve } from 'node:path';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';

const tinyPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
const pack = zipSync({
  'pack.mcmeta': new TextEncoder().encode(JSON.stringify({ pack: { pack_format: 46, description: 'CraftAIB smoke pack' } })),
  'assets/minecraft/blockstates/stone.json': new TextEncoder().encode(JSON.stringify({ variants: { '': { model: 'block/stone' } } })),
  'assets/minecraft/models/block/stone.json': new TextEncoder().encode(JSON.stringify({ parent: 'block/cube_all', textures: { all: 'minecraft:block/custom_stone' } })),
  'assets/minecraft/textures/block/custom_stone.png': tinyPng,
  'assets/minecraft/textures/block/oak_planks.png': tinyPng,
  'assets/minecraft/textures/block/glass_pane_top.png': tinyPng,
  'assets/minecraft/textures/block/oak_stairs.png': tinyPng,
});

const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(previewUrl);
  await page.locator('[data-active-workspace]').waitFor();
  const navigation = page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first();
  if (!(await navigation.count())) await page.locator('[data-mobile-menu-toggle="true"]').click();
  await page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first().click();
  await page.locator('[data-active-workspace="projections"] input[type=file][accept*="litematic"]').setInputFiles(resolve('fixtures/ai-smoke.litematic'));
  await page.locator('[data-active-workspace="viewer_3d"]').waitFor();
  await page.locator('[data-renderer-mode="native"]').click();
  await page.locator('[data-lodestone-status="ready"]').waitFor({ timeout: 30000 });
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({ name: 'craftaib-smoke-pack.zip', mimeType: 'application/zip', buffer: Buffer.from(pack) });
  await page.locator('[data-lodestone-status="ready"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve('outputs/viewer-check/custom-resource-pack.png'), fullPage: false });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ customResourcePackLoaded: true, rendererReady: true, screenshot: 'outputs/viewer-check/custom-resource-pack.png', errors }, null, 2));
} finally {
  await browser.close();
}
