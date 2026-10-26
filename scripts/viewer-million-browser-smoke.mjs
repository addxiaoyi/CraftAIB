import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { serializeLitematica } from '../packages/cartographer-adapter/dist/index.js';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';

const temp = join(tmpdir(), `craftaib-million-${process.pid}`);
await mkdir(temp, { recursive: true });
const file = join(temp, 'million.litematic');
const cells = [];
const width = 128;
const height = 64;
const length = 128;
for (let y = 0; y < height; y += 1) for (let z = 0; z < length; z += 1) for (let x = 0; x < width; x += 1) {
  cells.push({ x, y, z, block: { id: (x + z + y) % 13 === 0 ? 'minecraft:stone_bricks' : 'minecraft:oak_planks' } });
}
await writeFile(file, await serializeLitematica({ version: 1, width, height, length, cells, palette: [{ id: 'minecraft:air' }, { id: 'minecraft:stone_bricks' }, { id: 'minecraft:oak_planks' }], coordinateSystem: 'xyz', origin: { x: 0, y: 0, z: 0 } }, { name: 'Million voxel smoke' }));

const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const started = Date.now();
try {
  await page.goto(previewUrl);
  await page.locator('[data-active-workspace]').waitFor();
  const nav = page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first();
  if (!(await nav.count())) await page.locator('[data-mobile-menu-toggle="true"]').click();
  await page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first().click();
  await page.locator('[data-active-workspace="projections"] input[type=file][accept*="litematic"]').setInputFiles(file);
  await page.locator('[data-active-workspace="viewer_3d"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(5000);
  const settings = page.locator('[data-workspace-id="settings"]').filter({ visible: true }).first();
  if (!(await settings.count())) await page.locator('[data-mobile-menu-toggle="true"]').click();
  await page.locator('[data-workspace-id="settings"]').filter({ visible: true }).first().click();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ blocks: cells.length, importAndInteractionMs: Date.now() - started, viewerRemainedInteractive: true, errors }, null, 2));
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
