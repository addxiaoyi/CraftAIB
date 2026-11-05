import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';
import { countPixels, customPack, inspectPackPixels, json, packZip, texturePng } from './resource-pack-pixels.mjs';

const output = resolve('outputs/viewer-check');
await mkdir(output, { recursive: true });
const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const external = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('https://assets.mcasset.cloud/**', (route) => { external.push(route.request().url()); return route.abort(); });
const seed = () => {
  localStorage.setItem('craftaib.language', 'en');
  localStorage.setItem('craftaib.active-workspace', 'viewer_3d');
  const blocks = [];
  for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) blocks.push({ x, y, z: 0, blockId: x < 4 ? 'minecraft:stone' : 'minecraft:oak_planks' });
  localStorage.setItem('blockcraft_current_structure', JSON.stringify({ id: 'texture-acceptance', name: 'Texture acceptance', author: 'regression', description: '', version: '1.20.1', size: { x: 8, y: 4, z: 1 }, blocks, regions: [] }));
};
await page.addInitScript(seed);

async function upload(files, expectError = false) {
  const prior = await page.locator('canvas[data-lodestone-instance]').getAttribute('data-lodestone-instance').catch(() => null);
  const priorRequest = await page.locator('canvas[data-pack-request]').getAttribute('data-pack-request').catch(() => null);
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({ name: 'acceptance.zip', mimeType: 'application/zip', buffer: Buffer.isBuffer(files) ? files : packZip(files) });
  if (expectError) {
    await page.waitForFunction((old) => {
      const canvas = document.querySelector('canvas[data-pack-request]');
      return canvas && canvas.dataset.packRequest !== old && document.querySelector('[data-lodestone-status="error"]');
    }, priorRequest);
    await page.locator('[data-lodestone-status="error"]').waitFor();
    assert.equal(await page.locator('[data-lodestone-status="ready"]').count(), 0);
    return;
  }
  await page.waitForFunction((old) => {
    const canvas = document.querySelector('canvas[data-lodestone-instance]');
    return canvas && canvas.dataset.lodestoneInstance !== old && document.querySelector('[data-lodestone-status="ready"]');
  }, prior, { timeout: 30000 });
}

async function screenshot(name) {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const bytes = await page.locator('canvas[data-lodestone-instance]').screenshot();
  await writeFile(resolve(output, name), bytes);
  return bytes;
}

const isMagenta = (r, g, b) => r > 90 && b > 90 && g < 70;
const isGreen = (r, g, b) => g > 90 && r < 70 && b < 70;
try {
  await page.goto(previewUrl);
  await page.locator('[data-solid-status="ready"]').waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('blockcraft_current_structure')).id), 'texture-acceptance');
  assert.equal(await page.locator('[data-solid-status]').getAttribute('data-missing-textures'), '0');
  await page.locator('[data-renderer-mode="native"]').click();
  await page.locator('[data-lodestone-status="ready"]').waitFor();
  await page.locator('[data-lodestone-view="front"]').click();
  const canvasBounds = await page.locator('canvas[data-lodestone-instance]').boundingBox();
  const focus = { x: canvasBounds.x + canvasBounds.width / 2, y: canvasBounds.y + canvasBounds.height / 2 };
  await page.keyboard.down('Alt');
  await page.mouse.move(focus.x - 35, focus.y);
  await page.waitForFunction(() => document.querySelector('[data-lodestone-status="block-picked"]')?.textContent?.startsWith('minecraft:stone'));
  await page.mouse.move(focus.x + 35, focus.y);
  await page.waitForFunction(() => document.querySelector('[data-lodestone-status="block-picked"]')?.textContent?.startsWith('minecraft:oak_planks'));
  await page.mouse.move(canvasBounds.x + 10, canvasBounds.y + canvasBounds.height / 2);
  await page.keyboard.up('Alt');
  const baseline = await screenshot('default-textures.png');
  assert.equal(countPixels(baseline, isMagenta), 0, 'Bundled stone must not render the missing-texture pattern.');

  await upload(customPack);
  const painted = await screenshot('custom-resource-pack.png');
  const paintedPixels = countPixels(painted, isMagenta);
  assert.ok(paintedPixels > 500, `The uploaded texture must visibly change stone pixels, got ${paintedPixels}.`);

  const animatedPack = {
    ...customPack,
    'assets/acceptance/textures/block/paint.png': texturePng(64, 128, (x, y) => y < 64 ? [255, 0, 0, 255] : [0, 255, 0, 255]),
    'assets/acceptance/textures/block/paint.png.mcmeta': json({ animation: { frames: [1, 0] } }),
  };
  await upload(animatedPack);
  const animated = await screenshot('animated-first-frame.png');
  assert.ok(countPixels(animated, isGreen) > 500, 'The selected animation frame must appear in the rendered scene.');
  assert.equal(countPixels(animated, isMagenta), 0, 'Uploading a second pack must remove the previous texture.');

  await upload({ ...customPack, 'assets/acceptance/textures/block/paint.png': texturePng(64, 64, (x) => [255, 0, 255, x < 32 ? 0 : 255]) });
  const cutout = await screenshot('transparent-resource-pack.png');
  const cutoutPixels = countPixels(cutout, isMagenta);
  assert.ok(cutoutPixels > paintedPixels * 0.3 && cutoutPixels < paintedPixels * 0.7, 'Transparent texels must reveal the background, not old atlas pixels.');

  const atlas = await inspectPackPixels(page);
  const invalidPacks = [
    Buffer.from('not a zip'),
    { 'assets/minecraft/models/block/stone.json': json([]) },
    { ...customPack, 'assets/acceptance/textures/block/paint.png': new Uint8Array([1, 2, 3]) },
    { ...customPack, 'assets/acceptance/models/block/painted.json': json({ parent: 'acceptance:block/painted' }) },
    { ...customPack, 'assets/acceptance/models/block/painted.json': json({ parent: 'block/cube_all', textures: { all: '#loop', loop: '#all' } }) },
    { ...customPack, 'assets/acceptance/textures/block/paint.png.mcmeta': json({ animation: { frames: [9] } }) },
    { ...customPack, 'assets/acceptance/textures/block/paint.png': texturePng(4097, 1, () => [255, 0, 0, 255]) },
  ];
  for (const invalid of invalidPacks) await upload(invalid, true);
  await page.locator('[data-resource-pack-reset="true"]').click();
  await page.locator('[data-lodestone-status="ready"]').waitFor();
  assert.equal(countPixels(await screenshot('default-textures-restored.png'), isMagenta), 0);
  await page.locator('[data-renderer-mode="lodestone"]').click();
  await page.locator('[data-solid-status="ready"]').waitFor();
  await upload(customPack);
  assert.equal(await page.locator('[data-renderer-mode="lodestone"]').count(), 1, 'Uploading must select the renderer that applies packs.');
  assert.ok(countPixels(await screenshot('resource-pack-reapplied.png'), isMagenta) > 500);

  const recovery = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await recovery.addInitScript(seed);
  recovery.on('pageerror', (error) => errors.push(error.message));
  let failures = 0;
  await recovery.route('**/lodestone-default-pack/atlas.png', async (route) => {
    if (failures >= 2) return route.continue();
    failures++;
    await route.fulfill({ status: failures === 1 ? 503 : 200, contentType: 'image/png', body: 'invalid image' });
  });
  await recovery.goto(previewUrl);
  await recovery.locator('[data-solid-status="error"]').waitFor();
  await recovery.locator('[data-solid-texture-retry="true"]').click();
  await recovery.waitForFunction(() => document.querySelector('[data-solid-status="error"]') && !document.querySelector('[data-solid-status="error"]')?.textContent?.includes('(503)'));
  assert.equal(failures, 2, 'The retry must decode the corrupted successful HTTP response.');
  await recovery.locator('[data-solid-texture-retry="true"]').click();
  await recovery.locator('[data-solid-status="ready"]').waitFor();
  assert.equal(await recovery.locator('[data-solid-status]').getAttribute('data-missing-textures'), '0');
  await recovery.close();
  assert.deepEqual(external, [], 'Known blocks must render without external texture requests.');
  assert.deepEqual(errors, []);
  const report = { paintedPixels, cutoutPixels, atlas, rejectedPacks: invalidPacks.length, packSwitch: true, defaultRestore: true, nativeRetry: true, externalTextureRequests: external.length, errors };
  await writeFile(resolve(output, 'texture-acceptance.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
