import assert from 'node:assert/strict';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { attachReferenceFeatures, planBuilding } from '../packages/ai-planner/dist/index.js';
import { parseLitematicaDocumentBytes, summarizeLitematicaDocument } from '../packages/craftmatic-adapter/dist/index.js';
const browser = await launchTestBrowser();
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 1000 });
const errors = [];
let responseMode = 'success';
let generatedPlan;
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/ai/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: true, vision: true, generationModel: 'mock-generation' }) }));
await page.route('**/api/ai/structure-plan**', async (route) => {
  if (responseMode === 'timeout') return route.fulfill({ status: 504, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'MODEL_TIMEOUT', message: 'Model request timed out after 1000ms. Check the model service and retry.' } }) });
  if (responseMode === 'rate') return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'RATE_LIMITED', message: 'The model service is rate limiting requests. Retry shortly.' } }) });
  if (responseMode === 'tls') return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'MODEL_TLS_CERTIFICATE_INVALID', message: 'The model endpoint TLS certificate uses a key that Node rejects as too weak.' } }) });
  const input = route.request().postDataJSON();
  assert.equal(input.constraints.sizeMode, input.referenceImage ? 'envelope' : 'exact', 'generation must send the correct size contract for prompt-only and reference-image builds');
  if (input.referenceImage) {
    assert.match(input.referenceImage.dataUrl, /^data:image\/(png|jpeg|webp|gif);base64,/);
    assert.equal('pixels' in input.referenceImage, false, 'reference pixels must not be expanded on the UI thread');
    assert.equal(input.constraints.detailLevel, 4, 'reference-image builds must retain the selected detail level for interior synthesis');
  }
  const planned = planBuilding({ prompt: input.prompt || 'reference building', seed: input.seed || 42, referenceImage: input.referenceImage, constraints: input.constraints });
  const plan = input.referenceImage?.referenceFeatures ? attachReferenceFeatures(planned, input.referenceImage.referenceFeatures) : planned;
  generatedPlan = plan;
  const generationLog = [
    { stage: 'model_request', turn: 1, tool: 'model decision', ok: true },
    { stage: 'tool_call', turn: 1, tool: 'build_voxel_structure', ok: true },
    { stage: 'tool_result', turn: 1, tool: 'build_voxel_structure', ok: true, blocks: plan.dimensions.width * plan.dimensions.height, regions: plan.regions.length },
    { stage: 'grid_validation', ok: true, blocks: plan.dimensions.width * plan.dimensions.height, regions: plan.regions.length },
  ];
  const progressFrames = generationLog.map((entry) => `event: progress\ndata: ${JSON.stringify(entry)}\n\n`).join('');
  return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `${progressFrames}event: result\ndata: ${JSON.stringify({ payload: { ok: true, plan }, generationLog })}\n\n` });
});
try {
  await page.goto(previewUrl);
  await page.locator('[data-active-workspace="ai_builder"]').waitFor();
  await page.locator('[data-ai-prompt="true"]').fill('a harbor city with a lighthouse');
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.body.innerText.includes('tool_result'), null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-ai-generate="true"]')?.disabled === false, null, { timeout: 30000 });
  assert.match(await page.locator('body').innerText(), /build_voxel_structure/);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-ai-export="litematic"]').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.litematic$/i);
  const filePath = await download.path();
  assert.ok(filePath, 'browser should finish writing the Litematic download');
  const litematic = await parseLitematicaDocumentBytes(new Uint8Array(await readFile(filePath)));
  const litematicSummary = summarizeLitematicaDocument(litematic);
  const expectedPlan = generatedPlan;
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
  await page.locator('[data-reference-report="true"]').waitFor();
  await page.locator('[data-reference-remove="true"]').click();
  await page.locator('[data-reference-report="true"]').waitFor({ state: 'detached' });

  responseMode = 'timeout';
  await page.locator('[data-ai-generate="true"]').click();
  await page.locator('[data-ai-error="true"]').waitFor();
  await page.locator('[data-ai-error-code="MODEL_TIMEOUT"]').waitFor();
  assert.match(await page.locator('[data-ai-error="true"]').innerText(), /model request timed out|model did not finish|模型响应超时|模型未.*完成/i);
  assert.equal(await page.locator('[data-local-preview="true"]').isVisible(), true);
  await page.locator('[data-local-preview="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ai-generate="true"]')?.disabled === false, null, { timeout: 30000 });

  responseMode = 'rate';
  await page.locator('[data-ai-generate="true"]').click();
  await page.locator('[data-ai-error="true"]').waitFor();
  await page.locator('[data-ai-error-code="RATE_LIMITED"]').waitFor();
  assert.match(await page.locator('[data-ai-error="true"]').innerText(), /retry shortly|\u7a0d\u540e\u91cd\u8bd5/i);
  responseMode = 'tls';
  await page.locator('[data-ai-generate="true"]').click();
  await page.locator('[data-ai-error-code="MODEL_TLS_CERTIFICATE_INVALID"]').waitFor();
  assert.match(await page.locator('[data-ai-error="true"]').innerText(), /TLS certificate|证书密钥强度过低/i);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ textGeneration: true, litematicDownload: true, litematicRegions: litematicSummary.regions, referenceGeneration: true, timeoutMessage: true, rateLimitMessage: true, explicitLocalRecovery: true, errors }, null, 2));
} finally { await browser.close(); }
