import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { analyzeReferencePixels, planBuilding } from '../packages/ai-planner/dist/index.js';

let upstreamAuth = null;
let upstreamMode = 'success';
let upstreamCalls = 0;
let upstreamPath = null;
let upstreamBody = null;
let probeNeedsForcedCall = false;
let planOverride = null;
const plan = planBuilding({ prompt: 'small stone house', seed: 17 });
const referenceFeatures = analyzeReferencePixels({ width: 48, height: 48 });
const modelPlan = {
  ...plan,
  referenceFacing: 'z-max',
  geometry: { parts: [{
    id: 'model-authored-volume', type: 'box', x: 2, y: 1, z: 2, width: plan.dimensions.width - 4, height: plan.dimensions.height - 2, length: plan.dimensions.length - 4,
    material: 'minecraft:stone_bricks', hollow: false, thickness: 1, facing: null, openSides: [], roofStyle: 'flat', ridgeAxis: 'x', purpose: 'structure',
  }] },
};
const upstream = createServer(async (request, response) => {
  upstreamAuth = request.headers.authorization;
  upstreamPath = request.url;
  upstreamCalls += 1;
  let bodyText = '';
  for await (const chunk of request) bodyText += chunk;
  try { upstreamBody = JSON.parse(bodyText); } catch { upstreamBody = null; }
  if (upstreamMode === 'rate') {
    response.writeHead(429, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'busy' } }));
    return;
  }
  if (upstreamMode === 'notfound') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'not found' } }));
    return;
  }
  if (upstreamMode === 'badrequest') {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'This model only supports max_completion_tokens.', code: 'unsupported_parameter' } }));
    return;
  }
  if (upstreamMode === 'slow') {
    setTimeout(() => { if (!response.destroyed) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] })); } }, 1800);
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  const isProbe = upstreamBody?.messages?.some((message) => message?.role === 'user' && String(message?.content ?? '').includes('Call craftaib_probe'));
  if (isProbe && (!probeNeedsForcedCall || upstreamBody?.tool_choice?.type === 'function')) {
    response.end(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'probe-call', type: 'function', function: { name: 'craftaib_probe', arguments: '{"ready":true}' } }] } }] }));
    return;
  }
  if (isProbe && probeNeedsForcedCall) {
    response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'I can help with that.' } }] }));
    return;
  }
  const hasTools = Array.isArray(upstreamBody?.tools);
  if (hasTools) {
    const calls = upstreamBody.messages.flatMap((message) => message?.tool_calls ?? []).map((call) => call?.function?.name);
    const hasBuild = calls.includes('build_voxel_structure');
    const hasInspect = calls.includes('inspect_voxel_structure');
    const hasFinish = calls.includes('finish_structure');
    const isObjectReference = /OBJECT reconstruction, not a habitable building/i.test(JSON.stringify(upstreamBody.messages));
    const nextCall = upstreamBody.tool_choice?.function?.name === 'analyze_reference_image'
      ? { name: 'analyze_reference_image', arguments: JSON.stringify({
        object: isObjectReference ? 'ornate hanging lantern' : 'stone castle', category: isObjectReference ? 'object' : 'building',
        silhouette: 'Recognizable central mass with a stepped outline.', visibleParts: ['main body', 'upper frame', 'base detail'],
        symmetry: 'bilateral', view: 'front', depthCues: ['visible side plane', 'projecting trim'],
      }) }
      : upstreamBody.tool_choice?.function?.name === 'review_reference_structure'
        ? { name: 'review_reference_structure', arguments: JSON.stringify({ buildId: 'build-3-1', matchesReference: true, mismatches: [], summary: 'The original subject and the executed voxel views agree in identity, visible components, proportions and materials.' }) }
      : !calls.includes('get_minecraft_blocks') ? { name: 'get_minecraft_blocks', arguments: '{"category":"all"}' }
      : !hasBuild ? { name: 'build_voxel_structure', arguments: JSON.stringify({ plan: planOverride ?? modelPlan }) }
        : !hasInspect ? { name: 'inspect_voxel_structure', arguments: '{"buildId":"build-3-1"}' }
        : !hasFinish ? { name: 'finish_structure', arguments: '{"buildId":"build-3-1"}' }
            : null;
    if (nextCall) {
      response.end(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: `smoke-${upstreamCalls}`, type: 'function', function: nextCall }] } }] }));
      return;
    }
  }
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }));
});
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const upstreamPort = upstream.address().port;
const testCwd = await mkdtemp(join(tmpdir(), 'craftaib-server-smoke-'));
const child = spawn(process.execPath, [resolve('scripts/server.mjs')], {
  cwd: testCwd,
  env: { ...process.env, PORT: '0', HTTPS_PROXY: 'http://127.0.0.1:1', HTTP_PROXY: 'http://127.0.0.1:1', NO_PROXY: 'example.invalid', CRAFTAIB_PUBLIC_DIR: resolve('dist'), CRAFTAIB_ADMIN_TOKEN: 'admin-secret', CRAFTAIB_MODEL_API_URL: `http://127.0.0.1:${upstreamPort}/v1`, CRAFTAIB_MODEL_API_KEY: 'smoke-secret', CRAFTAIB_MODEL: 'mock-text', CRAFTAIB_MODEL_TIMEOUT_MS: '5000', CRAFTAIB_MODEL_MAX_RETRIES: '1', CRAFTAIB_TEXT_API_URL: '', CRAFTAIB_TEXT_API_KEY: '', CRAFTAIB_TEXT_MODEL: '', CRAFTAIB_VISION_API_URL: '', CRAFTAIB_VISION_API_KEY: '', CRAFTAIB_VISION_MODEL: '' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const base = await new Promise((resolve, reject) => {
  child.stdout.on('data', (chunk) => {
    const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(chunk.toString());
    if (match) resolve(`http://127.0.0.1:${match[1]}`);
  });
  child.once('error', reject);
  child.once('exit', (code) => reject(new Error(`Server exited before listening (${code}).`)));
});

try {
  let status;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { status = await fetch(`${base}/api/ai/status`); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  assert.ok(status, 'server should start');
  const config = await status.json();
  assert.deepEqual({ ok: config.ok, text: config.text, vision: config.vision, model: config.textModel }, { ok: true, text: true, vision: true, model: 'mock-text' });
  assert.equal(JSON.stringify(config).includes('smoke-secret'), false, 'status must not expose API credentials');

  const invalid = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: '' }) });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_INPUT');

  const missing = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'a small stone house', referenceImage: { dataUrl: 'bad' } }) });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, 'INVALID_IMAGE');

  const generated = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'small stone house', seed: 17, constraints: { floors: 2, width: 24, length: 20 } }) });
  assert.equal(generated.status, 200);
  assert.equal(upstreamPath, '/v1/chat/completions', 'server startup should normalize OpenAI base URLs before planning');
  const output = await generated.json();
  assert.equal(output.ok, true);
  assert.equal(output.plan.version, 1);
  assert.equal(output.plan.regions.length > 0, true);
  assert.ok(output.generationLog.some((entry) => entry.tool === 'get_minecraft_blocks' && entry.ok), `generation log should record catalog tool execution: ${JSON.stringify(output.generationLog)}`);
  assert.ok(output.generationLog.some((entry) => entry.tool === 'build_voxel_structure' && entry.blocks > 0), 'generation log should report actual blocks placed by the voxel builder');
  assert.ok(output.generationLog.some((entry) => entry.stage === 'grid_validation' && entry.blocks > 0), 'generation log should report final non-empty BlockGrid validation');
  assert.equal(upstreamAuth, 'Bearer smoke-secret');
  assert.equal(JSON.stringify(output).includes('smoke-secret'), false, 'model credentials must not be included in planner output');
  planOverride = {
    ...modelPlan,
    components: [],
    rooms: [],
    geometry: { parts: [{ ...modelPlan.geometry.parts[0], x: 8, y: 0, z: 8, width: 8, height: 10, length: 8 }] },
  };
  const referencePlan = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'A castle in the reference image', referenceImage: { dataUrl: 'data:image/png;base64,aGVsbG8=', referenceFeatures }, constraints: { width: 256, height: 256, length: 256, sizeMode: 'envelope', includeInterior: false } }) });
  const referenceOutput = await referencePlan.json();
  assert.equal(referencePlan.status, 200, `reference plans smaller than the selected maximum envelope should not be forced into a cube: ${JSON.stringify({ error: referenceOutput.error, log: referenceOutput.generationLog })}`);
  assert.ok(referenceOutput.generationLog.some((entry) => entry.tool === 'analyze_reference_image' && entry.ok && /stone castle/.test(entry.message)), 'reference generation must log a model-authored semantic read of the original image');
  assert.equal(referenceOutput.plan.inference.detectedType, 'stone castle', 'the final plan must retain the model visual identification');
  assert.ok(upstreamBody.messages.some((message) => message.role === 'user' && message.content?.some?.((part) => part.type === 'image_url')), 'the original image must remain attached through the construction conversation');
  assert.ok(referenceOutput.plan.dimensions.width < 256 || referenceOutput.plan.dimensions.height < 256 || referenceOutput.plan.dimensions.length < 256);
  planOverride = null;
  const detailedPlan = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'small furnished stone house', constraints: { floors: 2, width: 24, length: 20, detailLevel: 4, includeInterior: true } }) });
  const detailedOutput = await detailedPlan.json();
  assert.equal(detailedPlan.status, 200, `high-detail plans should pass only after real interior voxels are generated: ${JSON.stringify(detailedOutput.error)}`);
  const interiorAudit = detailedOutput.generationLog.find((entry) => entry.stage === 'grid_validation');
  assert.ok(interiorAudit?.interiorBlocks >= 3, 'final server audit should count actual voxels inside the room bounds');
  assert.ok(interiorAudit?.interiorLights >= 1, 'final server audit should find an actual interior light block');
  planOverride = { ...plan, regions: plan.regions.map((region) => ({ ...region, name: 'ornamental roof tassel', role: 'roof decoration' })) };
  const referenceLantern = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: '灯笼', referenceImage: { dataUrl: 'data:image/png;base64,aGVsbG8=', referenceFeatures }, constraints: { detailLevel: 4, includeInterior: true, sizeMode: 'envelope' } }) });
  assert.equal(referenceLantern.status, 422, 'the tool fixture must not pass an unrelated house plan off as a reference lantern');
  const referenceLanternOutput = await referenceLantern.json();
  assert.equal(referenceLanternOutput.error.code, 'BUILD_VALIDATION_REPEATED');
  const userContent = upstreamBody.messages.find((message) => message.role === 'user')?.content ?? '';
  const requestText = Array.isArray(userContent) ? userContent.map((part) => part.text ?? '').join('\n') : String(userContent);
  assert.match(requestText, /OBJECT reconstruction, not a habitable building/i, 'lantern prompts must not ask the model for rooms and furniture');
  planOverride = null;
  const streamed = await fetch(`${base}/api/ai/structure-plan?stream=1`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify({ prompt: 'small stone house', seed: 17, constraints: { floors: 2, width: 24, length: 20 } }) });
  assert.match(streamed.headers.get('content-type') || '', /text\/event-stream/);
  const streamText = await streamed.text();
  for (const stage of ['request_ready', 'model_request', 'tool_call', 'tool_result', 'grid_validation']) {
    assert.ok(streamText.includes(`"stage":"${stage}"`), `stream should publish ${stage} events before finalizing`);
  }
  assert.ok(streamText.includes('event: result'), 'stream should finish with the validated StructurePlan');
  upstreamMode = 'badrequest';
  const rejectedPlan = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'small stone house' }) });
  assert.equal(rejectedPlan.status, 400);
  const rejectedBody = await rejectedPlan.json();
  assert.equal(rejectedBody.error.code, 'MODEL_REQUEST_REJECTED');
  assert.match(rejectedBody.error.message, /max_completion_tokens/);
  upstreamMode = 'success';
  const unauthorized = await fetch(`${base}/api/ai/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ generation: {} }) });
  assert.equal(unauthorized.status, 403);
  assert.equal((await unauthorized.json()).error.code, 'FORBIDDEN');
  const saved = await fetch(`${base}/api/ai/config`, { method: 'POST', headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }, body: JSON.stringify({ generation: { endpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`, model: 'mock-text', apiKey: 'new-secret', timeoutMs: 5000, retries: 2 }, vision: { endpoint: '', model: '', apiKey: '', timeoutMs: 5000, retries: 0 } }) });
  assert.equal(saved.status, 200);
  assert.equal(JSON.stringify(await saved.json()).includes('new-secret'), false, 'config response must not expose API credentials');
  const longTimeoutConfig = await fetch(`${base}/api/ai/config`, { method: 'POST', headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }, body: JSON.stringify({ generation: { endpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`, model: 'mock-text', apiKey: 'new-secret', timeoutMs: 300000, retries: 2 } }) });
  assert.equal(longTimeoutConfig.status, 200);
  const longTimeoutStatus = await fetch(`${base}/api/ai/status`);
  assert.equal((await longTimeoutStatus.json()).textTimeoutMs, 300000, 'server must preserve the full timeout range exposed by Settings');
  upstreamMode = 'success';
  const connectionTest = await fetch(`${base}/api/ai/test-connection`, { method: 'POST', headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }, body: JSON.stringify({ generation: { endpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`, model: 'mock-text', apiKey: 'new-secret', timeoutMs: 5000 } }) });
  assert.equal(connectionTest.status, 200);
  assert.equal((await connectionTest.json()).supportsToolCalls, true);
  assert.equal(upstreamBody.tool_choice, 'auto', 'first probe should match production tool-choice behavior');
  probeNeedsForcedCall = true;
  const forcedProbeTest = await fetch(`${base}/api/ai/test-connection`, { method: 'POST', headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }, body: JSON.stringify({ generation: { endpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`, model: 'mock-text', apiKey: 'new-secret', timeoutMs: 5000 } }) });
  assert.equal(forcedProbeTest.status, 200);
  const forcedProbeBody = await forcedProbeTest.json();
  assert.equal(forcedProbeBody.supportsToolCalls, true);
  assert.equal(forcedProbeBody.probeMode, 'forced');
  probeNeedsForcedCall = false;
  const baseEndpointTest = await fetch(`${base}/api/ai/test-connection`, { method: 'POST', headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }, body: JSON.stringify({ generation: { endpoint: `http://127.0.0.1:${upstreamPort}/v1`, model: 'mock-text', apiKey: 'new-secret', timeoutMs: 5000 } }) });
  assert.equal(baseEndpointTest.status, 200);
  assert.equal(upstreamPath, '/v1/chat/completions', 'bare OpenAI /v1 base URLs should resolve to chat completions');
  upstreamMode = 'notfound';
  const wrongEndpoint = await fetch(`${base}/api/ai/test-connection`, { method: 'POST', headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }, body: JSON.stringify({ generation: { endpoint: `http://127.0.0.1:${upstreamPort}/wrong-path`, model: 'mock-text', apiKey: 'new-secret', timeoutMs: 5000 } }) });
  assert.equal(wrongEndpoint.status, 422);
  assert.equal((await wrongEndpoint.json()).error.code, 'MODEL_ENDPOINT_NOT_FOUND');

  upstreamMode = 'rate';
  upstreamCalls = 0;
  const limited = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'small tower' }) });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
  assert.equal(upstreamCalls, 3, 'configured retries should be applied to 429 responses');

  const reconfigured = await fetch(`${base}/api/ai/config`, { method: 'POST', headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' }, body: JSON.stringify({ generation: { endpoint: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`, model: 'mock-text', apiKey: 'new-secret', timeoutMs: 1000, retries: 0 } }) });
  assert.equal(reconfigured.status, 200);
  upstreamMode = 'slow';
  const timedOut = await fetch(`${base}/api/ai/structure-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'small tower' }) });
  assert.equal(timedOut.status, 504);
  assert.equal((await timedOut.json()).error.code, 'MODEL_TIMEOUT');
  console.log('server smoke passed');
} finally {
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  await new Promise((resolve) => upstream.close(resolve));
  await rm(testCwd, { recursive: true, force: true });
}
