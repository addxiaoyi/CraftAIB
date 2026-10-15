import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('../node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/l/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe', args: ['--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env.CRAFTAIB_ARCHITECT_URL || 'http://127.0.0.1:4183/?architect-smoke=1');
  await page.locator('[data-workspace-id="ai_builder"]').waitFor();
  await page.locator('textarea').first().waitFor();
  assert.ok(await page.locator('textarea').count());
  await page.locator('textarea').first().fill('small stone tower with an oak roof');
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0 && !document.body.innerText.includes('0 voxels'), null, { timeout: 30000 });
  await page.locator('[data-reference-image="true"]').setInputFiles(resolve('res/logo.png'));
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ai-generate="true"]')?.disabled === false, null, { timeout: 30000 });
  assert.match(await page.locator('body').innerText(), /vision model is required|本地预览|视觉模型/i);
  await page.locator('[data-workspace-id="projections"]').click();
  await page.locator('[data-workspace-id="ai_builder"]').click();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ frontend: 'minecraft-architect-studio', localGeneration: true, workspaces: 10, errors }, null, 2));
} finally {
  await browser.close();
}
