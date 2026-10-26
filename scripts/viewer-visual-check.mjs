import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';

await mkdir(resolve('outputs/viewer-check'), { recursive: true });
const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(previewUrl);
  await page.locator('[data-active-workspace]').waitFor();
  const nav = page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first();
  if (!(await nav.count())) await page.locator('[data-mobile-menu-toggle="true"]').click();
  await page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first().click();
  await page.locator('[data-active-workspace="projections"] input[type=file][accept*="litematic"]').setInputFiles(resolve('fixtures/ai-smoke.litematic'));
  await page.locator('[data-active-workspace="viewer_3d"]').waitFor();
  await page.locator('[data-renderer-mode="native"]').click();
  await page.locator('[data-lodestone-status="ready"]').waitFor({ timeout: 30000 });
  await page.getByText(/faces/).waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve('outputs/viewer-check/lodestone-default.png'), fullPage: false });
  assert.equal(await page.locator('[data-lodestone-status="ready"]').count(), 1);
  const canvas = page.locator('[data-active-workspace="viewer_3d"] canvas').first();
  const box = await canvas.boundingBox();
  assert.ok(box);
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('[data-lodestone-status="block-picked"]').waitFor({ timeout: 5000 });
  await page.keyboard.up('Alt');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshot: 'outputs/viewer-check/lodestone-default.png', rendererReady: true, altPick: true, errors }, null, 2));
} finally {
  await browser.close();
}
