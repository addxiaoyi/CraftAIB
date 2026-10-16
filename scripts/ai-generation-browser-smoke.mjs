import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { planBuilding } from '../packages/ai-planner/dist/index.js';
const require = createRequire(import.meta.url);
const { chromium } = require('../node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/l/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe', args: ['--use-gl=swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/ai/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: true, vision: true, generationModel: 'mock-generation' }) }));
await page.route('**/api/ai/structure-plan', async (route) => {
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
  await page.locator('[data-reference-image="true"]').setInputFiles(resolve('res/logo.png'));
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ai-generate="true"]')?.disabled === false, null, { timeout: 30000 });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ textGeneration: true, referenceGeneration: true, errors }, null, 2));
} finally { await browser.close(); }
