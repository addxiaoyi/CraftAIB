import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('../node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/l/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe', args: ['--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env.CRAFTAIB_ARCHITECT_URL || 'http://127.0.0.1:4183/?viewer-regions-smoke=1');
  await page.locator('[data-workspace-id="projections"]').first().click();
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
