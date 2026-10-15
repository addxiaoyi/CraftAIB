import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { planBuilding } from '../packages/ai-planner/dist/index.js';

const require = createRequire(import.meta.url);
const { chromium } = require('../node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/l/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe', args: ['--use-gl=swiftshader'] });
const page = await browser.newPage();
const errors = [];
await page.addInitScript(() => localStorage.setItem('craftaib.language', 'en'));
page.on('pageerror', (error) => errors.push(error.message));
let responseMode = 'success';
let requested = null;
await page.route('**/api/ai/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: true, vision: true, textModel: 'mock-text', visionModel: 'mock-vision' }) }));
await page.route('**/api/ai/structure-plan', async (route) => {
  requested = route.request().postDataJSON();
  if (responseMode === 'failure') return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'MODEL_REQUEST_FAILED', message: 'Mock model unavailable.' } }) });
  if (responseMode === 'slow') {
    await new Promise((resolve) => setTimeout(resolve, 12000));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, plan: planBuilding({ prompt: 'stone tower', seed: 42 }) }) }).catch(() => {});
  }
  const plan = planBuilding({ prompt: requested.prompt, seed: requested.seed });
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, plan }) });
});

try {
  await page.goto(process.env.CRAFTAIB_PREVIEW_URL ?? 'http://127.0.0.1:4183/index.html?v=20261013-37');
  await page.locator('[data-mode-page="structure"]').waitFor({ state: 'visible' });
  await page.locator('#ai-building-prompt').fill('stone tower with an oak roof');
  await page.locator('#generate-ai-building').click();
  await page.waitForFunction(() => window.craftaibGenerationSource === 'ai' && window.craftaibImportedGrid?.cells?.length > 0, null, { timeout: 15000 });
  assert.match(requested.prompt, /stone tower with an oak roof/);
  assert.deepEqual(requested.constraints, { type: 'house', style: 'fantasy', floors: 2, width: 24, length: 24 });
  assert.equal(await page.locator('#ai-generation-source').getAttribute('data-state'), 'ready');

  responseMode = 'failure';
  await page.locator('#generate-ai-building').click();
  await page.waitForFunction(() => !document.querySelector('#generate-local-preview')?.hidden, null, { timeout: 10000 });
  assert.match(await page.locator('#ai-generation-source').innerText(), /AI planning failed/);
  await page.locator('#generate-local-preview').click();
  await page.waitForFunction(() => window.craftaibGenerationSource === 'local', null, { timeout: 10000 });

  responseMode = 'slow';
  await page.locator('#generate-ai-building').click();
  await page.locator('#cancel-building-generation').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#cancel-building-generation').click();
  await page.waitForFunction(() => document.querySelector('#cancel-building-generation')?.hidden, null, { timeout: 10000 });
  assert.match(await page.locator('#ai-generation-source').innerText(), /cancelled/i);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ aiSuccess: true, failureRecovery: true, cancellation: true, source: await page.locator('#ai-generation-source').innerText(), errors }, null, 2));
} finally {
  await browser.close();
}
