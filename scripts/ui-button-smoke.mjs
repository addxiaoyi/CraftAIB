import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/l/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe', args: ['--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(process.env.CRAFTAIB_PREVIEW_URL ?? 'http://127.0.0.1:4183/');
await page.locator('[data-active-workspace]').waitFor();
const ids = ['ai_builder', 'viewer_3d', 'projections', 'materials', 'pixel_art', 'map_art', 'voxel_lab', 'geo_scene', 'lego_ldraw', 'settings'];
const navigate = async (id) => {
  const button = page.locator(`[data-workspace-id="${id}"]`).first();
  if (!(await button.isVisible())) {
    const toolbox = page.locator('[data-toolbox-toggle="true"]');
    if (await toolbox.isVisible()) await toolbox.click();
  }
  await page.locator(`[data-workspace-id="${id}"]`).first().click();
  await page.waitForFunction((expected) => document.querySelector('[data-active-workspace]')?.getAttribute('data-active-workspace') === expected, id);
};
for (const id of ids) await navigate(id);
for (const task of ['map-art', 'voxel', 'geo', 'lego']) {
  const workspace = task === 'map-art' ? 'map_art' : task === 'voxel' ? 'voxel_lab' : task === 'geo' ? 'geo_scene' : 'lego_ldraw';
  await navigate(workspace);
  await page.locator(`[data-engine-commit="${task}"]`).click();
  await page.waitForFunction(() => document.querySelector('[data-active-workspace]')?.getAttribute('data-active-workspace') === 'viewer_3d', null, { timeout: 30000 });
}
const language = page.getByRole('button', { name: /Switch Language|EN|中/ }).first();
assert.equal(await language.count(), 1);
await language.click();
await language.click();
assert.deepEqual(errors, []);
assert.ok((await page.locator('button:visible').count()) >= 8);
console.log(JSON.stringify({ workspaces: ids.length, visibleButtons: await page.locator('button:visible').count(), errors }, null, 2));
await browser.close();
