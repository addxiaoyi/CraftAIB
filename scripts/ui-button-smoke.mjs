import assert from 'node:assert/strict';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';
const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(previewUrl);
await page.locator('[data-active-workspace]').waitFor();
const ids = ['ai_builder', 'viewer_3d', 'projections', 'materials', 'pixel_art', 'map_art', 'voxel_lab', 'geo_scene', 'lego_ldraw', 'settings'];
const navigate = async (id) => {
  const button = page.locator(`[data-workspace-id="${id}"]`).filter({ visible: true }).first();
  if (!(await button.count())) {
    await page.locator('[data-mobile-menu-toggle="true"]').click();
  }
  await page.locator(`[data-workspace-id="${id}"]`).filter({ visible: true }).first().click();
  await page.waitForFunction((expected) => document.querySelector('[data-active-workspace]')?.getAttribute('data-active-workspace') === expected, id);
};
for (const id of ids) await navigate(id);
await navigate('map_art');
await page.locator('[data-mapart-engine="waxmapart"]').click();
await page.waitForFunction(() => document.querySelector('[data-engine-commit="map-art"]')?.disabled === false, null, { timeout: 30000 });
assert.equal(await page.locator('[data-mapart-engine="waxmapart"]').getAttribute('aria-pressed'), 'true');
assert.equal(await page.locator('select').filter({ has: page.locator('option[value="cie76"]') }).count(), 1, 'WaxMapArt should expose its color difference selector');
assert.equal(await page.locator('option[value="jarvis-judice-ninke"]').count(), 1, 'dithering menu should not duplicate Jarvis-Judice-Ninke');
await page.locator('[data-mapart-engine="cartographer"]').click();
await page.waitForFunction(() => document.querySelector('[data-engine-commit="map-art"]')?.disabled === false, null, { timeout: 30000 });
assert.equal(await page.locator('[data-mapart-engine="cartographer"]').getAttribute('aria-pressed'), 'true');
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
