import assert from 'node:assert/strict';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';
import { resolve } from 'node:path';
const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/ai/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: false, vision: false }) }));
try {
  await page.goto(previewUrl);
  await page.locator('[data-active-workspace="ai_builder"]').waitFor();
  await page.locator('textarea').first().waitFor();
  assert.ok(await page.locator('textarea').count());
  await page.locator('textarea').first().fill('small stone tower with an oak roof');
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0 && !document.body.innerText.includes('0 voxels'), null, { timeout: 30000 });
  await page.locator('[data-reference-image="true"]').setInputFiles(resolve('res/logo.png'));
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ai-generate="true"]')?.disabled === false, null, { timeout: 30000 });
  assert.equal(await page.locator('[data-ai-error-code="MODEL_NOT_CONFIGURED"]').count(), 1);
  await page.locator('[data-mobile-menu-toggle="true"]').click();
  await page.locator('[data-workspace-id="projections"]').filter({ visible: true }).click();
  await page.locator('[data-mobile-menu-toggle="true"]').click();
  await page.locator('[data-workspace-id="ai_builder"]').filter({ visible: true }).click();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ frontend: 'minecraft-architect-studio', localGeneration: true, workspaces: 10, errors }, null, 2));
} finally {
  await browser.close();
}
