import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { planBuilding } from '../packages/ai-planner/dist/index.js';
import { parseLitematicaDocumentBytes, summarizeLitematicaDocument } from '../packages/craftmatic-adapter/dist/index.js';
const require = createRequire(import.meta.url);
const { chromium } = require('../node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/l/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe', args: ['--use-gl=swiftshader'] });
const page = await browser.newPage();
const errors = [];
let responseMode = 'success';
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/ai/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: true, vision: true, generationModel: 'mock-generation' }) }));
await page.route('**/api/ai/structure-plan', async (route) => {
  if (responseMode === 'timeout') return route.fulfill({ status: 504, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'MODEL_TIMEOUT', message: 'Model request timed out after 1000ms. Check the model service and retry.' } }) });
  if (responseMode === 'rate') return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'RATE_LIMITED', message: 'The model service is rate limiting requests. Retry shortly.' } }) });
  const input = route.request().postDataJSON();
  const plan = planBuilding({ prompt: input.prompt || 'reference building', seed: input.seed || 42, referenceImage: input.referenceImage });
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, plan }) });
});
try {
  await page.goto(process.env.CRAFTAIB_PREVIEW_URL ?? 'http://127.0.0.1:4183/');
  await page.locator('[data-workspace-id="ai_builder"]').waitFor();
  await page.locator('[data-ai-prompt="true"]').fill('a harbor city with a lighthouse');
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0 && !document.body.innerText.includes('0 voxels'), null, { timeout: 30000 });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-ai-export="litematic"]').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.litematic$/i);
  const filePath = await download.path();
  assert.ok(filePath, 'browser should finish writing the Litematic download');
  const litematic = await parseLitematicaDocumentBytes(new Uint8Array(await readFile(filePath)));
  const litematicSummary = summarizeLitematicaDocument(litematic);
  const expectedPlan = planBuilding({ prompt: 'a harbor city with a lighthouse' });
  assert.equal(litematic.regions.length, expectedPlan.regions.length);
  assert.deepEqual(litematicSummary.regions.map((region) => region.name), expectedPlan.regions.map((region) => region.name));
  assert.deepEqual(litematicSummary.metadata.enclosingSize, {
    x: expectedPlan.dimensions.width,
    y: expectedPlan.dimensions.height,
    z: expectedPlan.dimensions.length,
  });
  assert.equal(litematicSummary.metadata.totalBlocks, litematicSummary.regions.reduce((total, region) => total + region.blocks, 0));
  assert.ok(litematicSummary.metadata.totalBlocks > 0, 're-imported Litematic should contain blocks');
  await page.locator('[data-reference-image="true"]').setInputFiles(resolve('res/logo.png'));
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ai-generate="true"]')?.disabled === false, null, { timeout: 30000 });

  responseMode = 'timeout';
  await page.locator('[data-ai-generate="true"]').click();
  await page.locator('[data-ai-error="true"]').waitFor();
  await page.locator('[data-ai-error-code="MODEL_TIMEOUT"]').waitFor();
  assert.match(await page.locator('[data-ai-error="true"]').innerText(), /lower detail|smaller dimensions|local preview|\u964d\u4f4e.*\u590d\u6742\u5ea6|\u672c\u5730.*\u9884\u89c8/i);
  assert.equal(await page.locator('[data-local-preview="true"]').isVisible(), true);
  await page.locator('[data-local-preview="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ai-generate="true"]')?.disabled === false, null, { timeout: 30000 });

  responseMode = 'rate';
  await page.locator('[data-ai-generate="true"]').click();
  await page.locator('[data-ai-error="true"]').waitFor();
  await page.locator('[data-ai-error-code="RATE_LIMITED"]').waitFor();
  assert.match(await page.locator('[data-ai-error="true"]').innerText(), /retry shortly|\u7a0d\u540e\u91cd\u8bd5/i);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ textGeneration: true, litematicDownload: true, litematicRegions: litematicSummary.regions, referenceGeneration: true, timeoutMessage: true, rateLimitMessage: true, explicitLocalRecovery: true, errors }, null, 2));
} finally { await browser.close(); }
