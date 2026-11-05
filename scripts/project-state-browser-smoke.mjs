import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';

const browser = await launchTestBrowser();
const errors = [];
const structure = {
  id: 'project-roundtrip', name: 'Persisted NBT', description: '', author: 'browser test', version: '1.20.4',
  size: { x: 1, y: 1, z: 1 }, origin: { x: -8, y: 64, z: 2 }, regions: [],
  blocks: [{ x: 0, y: 0, z: 0, blockId: 'minecraft:chest', state: { facing: 'east' } }],
  metadata: { blockEntities: [{ nbt: { LootTableSeed: { type: 4, value: { $craftaibBigInt: '9223372036854775807' } }, Bytes: { type: 7, value: { $craftaibBytes: [0, 128, 255] } } } }] },
};
const project = { version: 1, activeWorkspace: 'viewer_3d', language: 'en', autoSave: true, structure, history: [structure], savedAt: new Date().toISOString() };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('craftaib.language', 'en');
    localStorage.setItem('blockcraft_current_structure', '{"size":1,"blocks":[]}');
  });
  await page.goto(previewUrl);
  await page.locator('[data-storage-warning]').waitFor();
  await page.locator('[data-active-workspace="ai_builder"]').waitFor();
  const input = page.locator('input[accept="application/json,.craftaib.json"]');
  const uploadProject = (value) => input.setInputFiles({ name: 'project.craftaib.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await uploadProject({ ...project, structure: { ...structure, regions: undefined } });
  await page.getByText('Structure regions must be an array.', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-active-workspace]').getAttribute('data-active-workspace'), 'ai_builder');
  await uploadProject({ ...project, placements: [null] });
  await page.getByText('Placement must be an object.', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-active-workspace]').getAttribute('data-active-workspace'), 'ai_builder');
  await uploadProject(project);
  await page.locator('[data-active-workspace="viewer_3d"]').waitFor();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('[data-project-action="save"]').filter({ visible: true }).first().click();
  const download = await downloadEvent;
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.deepEqual(saved.structure.origin, structure.origin);
  assert.deepEqual(saved.structure.metadata, structure.metadata);
  assert.deepEqual(saved.structure.blocks, structure.blocks);

  // Use a new page so the corruption fixture is not injected again on reload.
  const restored = await page.context().newPage();
  restored.on('pageerror', (error) => errors.push(error.message));
  await restored.goto(previewUrl);
  await restored.locator('[data-active-workspace="viewer_3d"]').waitFor();
  assert.equal(await restored.locator('[data-storage-warning]').count(), 0);
  const secondDownload = restored.waitForEvent('download');
  await restored.locator('[data-project-action="save"]').filter({ visible: true }).first().click();
  assert.deepEqual(JSON.parse(await readFile(await (await secondDownload).path(), 'utf8')).structure, saved.structure);

  const denied = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  denied.on('pageerror', (error) => errors.push(error.message));
  await denied.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage denied', 'SecurityError'); } });
  });
  await denied.goto(previewUrl);
  await denied.locator('[data-storage-warning]').waitFor();
  await denied.locator('[data-active-workspace="ai_builder"]').waitFor();
  const recoveryDownload = denied.waitForEvent('download');
  await denied.locator('[data-storage-warning] button').click();
  assert.match((await recoveryDownload).suggestedFilename(), /\.craftaib\.json$/);
  assert.deepEqual(errors, []);
  console.log('Project browser regression passed: atomic invalid import, corrupt/denied storage recovery, project download, NBT and origin persistence.');
} finally {
  await browser.close();
}
