import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';

const output = resolve('outputs/lodestone-review');
await mkdir(output, { recursive: true });
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
  await page.waitForTimeout(3500);
  const closePanel = page.locator('[data-viewer-inspector-toggle="true"]');
  if (await closePanel.count()) await closePanel.click({ force: true });
  for (const view of ['iso', 'front', 'side', 'top']) {
    await page.locator(`[data-lodestone-view="${view}"]`).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(output, `${view}.png`), fullPage: false });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ output, views: ['iso', 'front', 'side', 'top'], textured: true, errors }, null, 2));
} finally {
  await browser.close();
}
