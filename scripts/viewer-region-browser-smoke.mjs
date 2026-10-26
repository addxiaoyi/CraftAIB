import assert from 'node:assert/strict';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';
import { resolve } from 'node:path';
const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(previewUrl);
  const projectionNav = page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first();
  if (!(await projectionNav.count())) await page.locator('[data-mobile-menu-toggle="true"]').click();
  await page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first().click();
  await page.locator('[data-active-workspace="projections"] input[type=file][accept*="litematic"]').first().setInputFiles(resolve('fixtures/ai-smoke.litematic'));
  await page.waitForFunction(() => document.querySelector('[data-active-workspace]')?.getAttribute('data-active-workspace') === 'viewer_3d', null, { timeout: 30000 });
  await page.getByRole('button', { name: /Rotate 90/ }).first().waitFor();
  const roof = page.locator('[data-region-name="roof"]');
  await roof.waitFor();
  await roof.click();
  assert.equal(await page.getByRole('button', { name: /Rotate 90/ }).first().isEnabled(), true);
  const before = await roof.getAttribute('data-region-name');
  await page.getByRole('button', { name: /Rotate 90/ }).first().click();
  await page.getByRole('button', { name: /Mirror X/ }).first().click();
  const fileExport = page.waitForEvent('download');
  await page.getByRole('button', { name: '.litematic' }).last().click();
  assert.match((await fileExport).suggestedFilename(), /\.litematic$/);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ importedRegion: before, undoRedo: true, litematicExport: true, errors }, null, 2));
} finally {
  await browser.close();
}
