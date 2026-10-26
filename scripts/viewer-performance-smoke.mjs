import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serializeLitematica } from '../packages/cartographer-adapter/dist/index.js';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';

const temp = join(tmpdir(), `craftaib-viewer-${process.pid}`);
await mkdir(temp, { recursive: true });
const file = join(temp, 'large-viewer.litematic');
const cells = [];
for (let y = 0; y < 72; y += 1) {
  for (let z = 0; z < 64; z += 1) {
    for (let x = 0; x < 64; x += 1) {
      if (y === 0 || y === 71 || x === 0 || x === 63 || z === 0 || z === 63 || (x + z + y) % 7 === 0) {
        cells.push({ x, y, z, block: { id: y % 11 === 0 ? 'minecraft:stone_bricks' : 'minecraft:oak_planks' } });
      }
    }
  }
}
await writeFile(file, await serializeLitematica({ version: 1, width: 64, height: 72, length: 64, cells, palette: [{ id: 'minecraft:air' }, { id: 'minecraft:stone_bricks' }, { id: 'minecraft:oak_planks' }], coordinateSystem: 'xyz', origin: { x: 0, y: 0, z: 0 } }, { name: 'Large viewer smoke' }));

const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(previewUrl);
  await page.locator('[data-active-workspace]').waitFor();
  const nav = page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first();
  if (!(await nav.count())) await page.locator('[data-mobile-menu-toggle="true"]').click();
  await page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first().click();
  await page.locator('[data-active-workspace="projections"] input[type=file][accept*="litematic"]').setInputFiles(file);
  await page.locator('[data-active-workspace="viewer_3d"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => document.body.innerText.includes('preview') || document.body.innerText.includes('voxels'), null, { timeout: 30000 });
  const visibleCount = await page.locator('body').innerText();
  assert.match(visibleCount, /voxels/);
  const settings = page.locator('[data-workspace-id="settings"]').filter({ visible: true }).first();
  if (!(await settings.count())) await page.locator('[data-mobile-menu-toggle="true"]').click();
  await page.locator('[data-workspace-id="settings"]').filter({ visible: true }).first().click();
  await page.locator('[data-active-workspace="settings"]').waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ blocks: cells.length, imported: true, viewerRemainedInteractive: true, errors }, null, 2));
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
