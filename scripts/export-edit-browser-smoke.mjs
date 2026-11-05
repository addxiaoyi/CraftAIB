import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';
import { parseLitematicaDocumentBytes } from '../packages/craftmatic-adapter/dist/index.js';

const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/ai/status', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, text: false, vision: false }) }));
await page.addInitScript(() => {
  localStorage.setItem('craftaib.language', 'en');
  localStorage.setItem('craftaib.active-workspace', 'viewer_3d');
  localStorage.setItem('blockcraft_current_structure', JSON.stringify({
    id: 'edited-export', name: 'Edited export', author: 'regression', description: '', version: '1.20.4',
    size: { x: 3, y: 1, z: 2 }, origin: { x: -3, y: 2, z: 5 },
    blocks: [
      { x: 0, y: 0, z: 0, blockId: 'minecraft:oak_stairs', state: { facing: 'north', half: 'bottom', shape: 'straight' } },
      { x: 2, y: 0, z: 1, blockId: 'minecraft:oak_log', state: { axis: 'x' } },
    ],
    regions: [
      { id: 'stairs', name: 'stairs', bounds: { min: [0, 0, 0], max: [1, 1, 1] }, color: '#00ff00', locked: false, visible: true },
      { id: 'log', name: 'log', bounds: { min: [2, 0, 1], max: [3, 1, 2] }, color: '#ff0000', locked: false, visible: true },
    ],
    plan: { version: 1, name: 'Invalid stale recipe', regions: [] },
  }));
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    postMessage(task, ...rest) {
      if (window.failExports && task.type === 'export') {
        window.setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { taskId: task.id, type: 'error', code: 'EXPORT_FAILED', message: 'Injected export failure. Retry the download.' } })), 100);
        return;
      }
      return super.postMessage(task, ...rest);
    }
  };
});
try {
  await page.goto(previewUrl);
  await page.locator('[data-active-workspace="viewer_3d"]').waitFor();
  await page.getByRole('button', { name: /Rotate 90/ }).first().click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('blockcraft_current_structure')));
  assert.deepEqual(saved.size, { x: 2, y: 1, z: 3 });
  assert.equal(saved.blocks[0].state.facing, 'east');
  assert.equal(saved.plan, undefined);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '.litematic', exact: true }).click();
  const artifact = await downloaded;
  const document = await parseLitematicaDocumentBytes(new Uint8Array(await readFile(await artifact.path())));
  assert.deepEqual(document.regions.map((region) => region.name), ['stairs', 'log']);
  const cells = document.regions.flatMap((region) => region.cells);
  const stairs = cells.find((cell) => cell.block.id === 'minecraft:oak_stairs');
  assert.deepEqual({ x: stairs.x, y: stairs.y, z: stairs.z }, { x: -2, y: 2, z: 5 });
  assert.equal(stairs.block.properties.facing, 'east');
  assert.equal(cells.find((cell) => cell.block.id === 'minecraft:oak_log').block.properties.axis, 'z');

  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await page.locator('[data-workspace-id="projections"]').filter({ visible: true }).first().click();
  await page.locator('[data-workspace-id="viewer_3d"]').filter({ visible: true }).first().click();
  assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).first().isEnabled(), false, 'leaving and returning after undo must not restore the discarded future');
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('blockcraft_current_structure')));
  assert.equal(restored.blocks[0].state.facing, 'north');

  await page.evaluate(() => { window.failExports = true; });
  for (const workspace of ['ai_builder', 'projections']) {
    await page.locator(`[data-workspace-id="${workspace}"]`).filter({ visible: true }).first().click();
    const scope = page.locator(`[data-active-workspace="${workspace}"]`);
    await scope.waitFor();
    const downloadButton = workspace === 'ai_builder' ? scope.locator('[data-ai-export="litematic"]') : scope.getByRole('button', { name: /\.litematic/ }).first();
    await downloadButton.click();
    await scope.locator('[data-export-error]').waitFor();
    assert.match(await scope.locator('[data-export-error]').innerText(), /Injected export failure/);
    assert.equal(await downloadButton.isEnabled(), true);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ editedVoxelRoundTrip: true, blockStates: true, namedRegions: true, undoAcrossNavigation: true, exportErrors: ['ai_builder', 'projections'], errors }));
} finally {
  await browser.close();
}
