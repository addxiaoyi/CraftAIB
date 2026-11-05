import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
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
const verifiedRequests = [];
// The explicit-selection contract is checked against whatever the test locked in before the click.
const unlockedConstraints = () => ({ width: undefined, height: undefined, length: undefined, floors: undefined, detailLevel: undefined });
let expectedRequest = { label: 'default prompt-only build', ...unlockedConstraints() };
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
  }
  // Only a locked size or detail level may reach the model; Auto must leave the key undefined.
  for (const key of ['width', 'height', 'length', 'floors', 'detailLevel']) {
    assert.equal(input.constraints[key], expectedRequest[key], `${expectedRequest.label}: expected constraints.${key} to be ${String(expectedRequest[key])}, received ${String(input.constraints[key])}`);
  }
  verifiedRequests.push(expectedRequest.label);
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

  // The preview must be a painted, textured render, not an empty canvas behind a DOM shell.
  const preview = page.locator('[data-ai-renderer="textured"]');
  await preview.waitFor({ timeout: 30000 });
  const previewBlocks = Number(await preview.getAttribute('data-ai-preview-blocks'));
  assert.ok(previewBlocks > 0, `textured preview should receive blocks, received ${previewBlocks}`);
  await page.waitForFunction(() => document.querySelector('[data-lodestone-status]')?.textContent?.includes('Minecraft resource pack ready'), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const previewPng = PNG.sync.read(await preview.locator('canvas').screenshot());
  let opaquePixels = 0;
  const previewColors = new Set();
  for (let offset = 0; offset < previewPng.data.length; offset += 4) {
    if (previewPng.data[offset + 3] < 8) continue;
    opaquePixels += 1;
    previewColors.add(`${previewPng.data[offset] >> 4},${previewPng.data[offset + 1] >> 4},${previewPng.data[offset + 2] >> 4}`);
  }
  const coverage = opaquePixels / (previewPng.width * previewPng.height);
  assert.ok(coverage > 0.05, `textured preview should paint most of the canvas, coverage=${coverage.toFixed(3)}`);
  assert.ok(previewColors.size >= 12, `textured preview should show many block colours, distinct=${previewColors.size}`);
  const previewPixels = { blocks: previewBlocks, width: previewPng.width, height: previewPng.height, opaque: opaquePixels, colors: previewColors.size, coverage: Number(coverage.toFixed(3)) };

  // Slicing must rebuild the mesh in place, not swap the Lodestone renderer instance.
  const instanceBeforeSlice = await preview.locator('canvas').getAttribute('data-lodestone-instance');
  assert.ok(instanceBeforeSlice, 'textured preview should expose its renderer instance');
  const slice = page.locator('[data-ai-slice="true"]');
  const fullHeight = Number(await slice.getAttribute('max'));
  const sliceHeight = Math.max(1, Math.floor(fullHeight / 2));
  await slice.fill(String(sliceHeight));
  await page.waitForFunction((expected) => {
    const value = document.querySelector('[data-ai-preview-blocks]')?.getAttribute('data-ai-preview-blocks');
    return value !== null && Number(value) < expected;
  }, previewBlocks, { timeout: 15000 });
  const slicedBlocks = Number(await preview.getAttribute('data-ai-preview-blocks'));
  assert.ok(slicedBlocks > 0, `sliced preview should keep blocks, received ${slicedBlocks}`);
  const instanceAfterSlice = await preview.locator('canvas').getAttribute('data-lodestone-instance');
  assert.equal(instanceAfterSlice, instanceBeforeSlice, 'slicing should reuse the renderer instance');
  await page.waitForFunction(() => document.querySelector('[data-lodestone-status]')?.textContent?.includes('Minecraft resource pack ready'), null, { timeout: 15000 });
  const sliceResult = { fullHeight, sliceHeight, blocksBefore: previewBlocks, blocksAfter: slicedBlocks, rendererReused: instanceAfterSlice === instanceBeforeSlice };

  // Locking a size or a detail level must reach the request; Auto must release them again.
  expectedRequest = { label: 'locked 16x24x16 envelope', ...unlockedConstraints(), width: 16, height: 24, length: 16 };
  await page.locator('[data-size-preset="16x24x16"]').click();
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ai-generate="true"]')?.disabled === false, null, { timeout: 30000 });

  expectedRequest = { label: 'locked 16x24x16 envelope with detail 3', ...unlockedConstraints(), width: 16, height: 24, length: 16, detailLevel: 3 };
  await page.locator('[data-detail-level="3"]').click();
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ai-generate="true"]')?.disabled === false, null, { timeout: 30000 });

  expectedRequest = { label: 'released envelope and detail after Auto', ...unlockedConstraints() };
  await page.locator('[data-detail-auto="true"]').click();
  await page.locator('[data-size-auto="true"]').click();
  await page.locator('[data-ai-generate="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ai-generate="true"]')?.disabled === false, null, { timeout: 30000 });

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
  expectedRequest = { label: 'reference-image build without a locked envelope', ...unlockedConstraints() };
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
  console.log(JSON.stringify({ textGeneration: true, litematicDownload: true, litematicRegions: litematicSummary.regions, referenceGeneration: true, verifiedRequests, timeoutMessage: true, rateLimitMessage: true, explicitLocalRecovery: true, previewPixels, sliceResult, errors }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ previewStatus: await page.locator('[data-lodestone-status]').allTextContents(), errors }));
  throw error;
} finally { await browser.close(); }
