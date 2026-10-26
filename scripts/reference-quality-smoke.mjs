import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { analyzeReferencePixels, attachReferenceFeatures, compareReferenceFrontMask, planBuilding, planBuildingWithModel, structurePlanToGrid } from '../packages/ai-planner/dist/index.js';
import { renderVoxelReview } from './lib/voxel-preview.mjs';

const pixels = new Uint8Array(120 * 60 * 4).fill(255);
for (let y = 15; y < 45; y++) for (let x = 24; x < 96; x++) {
  const offset = (y * 120 + x) * 4;
  pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 30;
}
const features = analyzeReferencePixels({ width: 120, height: 60, pixels });
assert.equal(features.maskWidth / features.maskHeight, 2, 'analysis must preserve source aspect');
const plan = attachReferenceFeatures(planBuilding({ prompt: 'a rectangular box', constraints: { width: 24, height: 10, length: 24 } }), features);
plan.referenceFacing = 'z-min';
plan.components = [];
plan.rooms = [];
plan.floors = 1;
plan.geometry = { parts: [{ id: 'housing', type: 'shell', x: 0, y: 0, z: 0, width: 24, height: 10, length: 24, material: 'minecraft:red_concrete', thickness: 1 }] };
const grid = structurePlanToGrid(plan);
const match = compareReferenceFrontMask(plan, grid.cells);
const targetWidth = Math.ceil(features.subjectBounds.right * features.maskWidth) - Math.floor(features.subjectBounds.left * features.maskWidth);
assert.ok(match.referenceRows.every((row) => row.length === targetWidth), 'crop must retain its entire measured width');
assert.ok(match.generatedRows.every((row) => row.length === targetWidth));
assert.ok(match.silhouette > 0.85, `rectangular silhouette should match (${match.silhouette})`);
const largeCells = Array.from({ length: 220000 }, (_, index) => ({ x: index % 100, y: Math.floor(index / 100) % 100, z: Math.floor(index / 10000) }));
assert.ok(Number.isFinite(compareReferenceFrontMask(plan, largeCells).silhouette), 'large grids must not overflow the argument stack');

const png = PNG.sync.read(Buffer.from(renderVoxelReview(grid).split(',')[1], 'base64'));
assert.equal(png.width, 256);
assert.equal(png.height, 256);
for (const [x, y] of [[64, 64], [192, 64], [64, 192], [192, 192]]) {
  const pixel = (y * png.width + x) * 4;
  assert.ok(png.data[pixel] > png.data[pixel + 1], 'each rendered view must show the red shell');
}
const layeredGrid = { ...grid, cells: [{ x: 0, y: 0, z: 0, block: { id: 'minecraft:red_concrete' } }, { x: 0, y: 0, z: 1, block: { id: 'minecraft:blue_concrete' } }] };
const layers = PNG.sync.read(Buffer.from(renderVoxelReview(layeredGrid).split(',')[1], 'base64'));
assert.ok(layers.data[(64 * 256 + 64) * 4] > layers.data[(64 * 256 + 64) * 4 + 2], 'front must show the near red cell');
assert.ok(layers.data[(64 * 256 + 192) * 4 + 2] > layers.data[(64 * 256 + 192) * 4], 'rear must show the near blue cell');

let requests = 0;
let cancelled = false;
const started = Date.now();
await assert.rejects(planBuildingWithModel({ prompt: 'box' }, {
  endpoint: 'https://fixture.invalid', requestTimeoutMs: 1000, maxRetries: 2,
  fetcher: async () => {
    requests++;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } }));
  },
}), (error) => error.code === 'MODEL_TIMEOUT');
assert.equal(requests, 1, 'timed-out model generations must not be silently replayed');
assert.equal(cancelled, true, 'the stalled response body must be cancelled');
assert.ok(Date.now() - started < 2500, 'timeout must cover headers and body');

let reviewCount = 0;
let buildCount = 0;
let sawRenderedViews = false;
let rejected = false;
const accepted = await planBuildingWithModel({ prompt: 'Match this box.', constraints: { includeInterior: false }, referenceImage: { width: 120, height: 60, dataUrl: 'data:image/png;base64,AA==', referenceFeatures: features } }, {
  endpoint: 'https://fixture.invalid', maxRetries: 0, renderPreview: (grid, current) => renderVoxelReview(grid, current.referenceFacing),
  fetcher: async (_url, init) => {
    const body = JSON.parse(init.body);
    const required = body.tool_choice.function.name;
    assert.equal(body.parallel_tool_calls, false);
    assert.ok(body.messages.some((message) => message.role === 'user' && message.content?.some?.((part) => part.image_url?.url === 'data:image/png;base64,AA==')), 'original must remain in every model turn');
    const latestBuild = body.messages.filter((message) => message.role === 'tool').map((message) => JSON.parse(message.content)).findLast((reply) => reply.buildId)?.buildId;
    let args;
    if (required === 'analyze_reference_image') args = { object: 'red rectangular box', category: 'object', silhouette: 'wide rectangular housing', visibleParts: ['housing', 'top', 'side'], symmetry: 'bilateral', view: 'front', depthCues: ['visible side panel'] };
    else if (required === 'get_minecraft_blocks') args = { category: 'all' };
    else if (required === 'build_voxel_structure') {
      if (rejected) assert.equal(reviewCount, 1, 'negative review must force a revised build');
      buildCount++;
      args = { plan: buildCount === 1 ? plan : { ...plan, geometry: { parts: [...plan.geometry.parts, { id: 'inner-light', type: 'box', x: 12, y: 5, z: 12, width: 1, height: 1, length: 1, material: 'minecraft:sea_lantern' }] } } };
    } else if (required === 'inspect_voxel_structure') args = { buildId: latestBuild };
    else if (required === 'review_reference_structure') {
      sawRenderedViews ||= body.messages.some((message) => message.role === 'user' && message.content?.some?.((part) => part.image_url?.url?.startsWith('data:image/png;base64,') && part.image_url.url.length > 100));
      assert.equal(sawRenderedViews, true, 'review must receive the executed block images');
      reviewCount++;
      rejected = reviewCount === 1;
      args = { buildId: latestBuild, matchesReference: !rejected, mismatches: rejected ? ['The interior light is missing.'] : [], summary: rejected ? 'Add an internal light.' : 'The red housing and light agree with the subject.' };
    } else throw new Error(`Unexpected required tool ${required}`);
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: `step-${body.messages.length}`, type: 'function', function: { name: required, arguments: JSON.stringify(args) } }] } }] }));
  },
});
assert.equal(buildCount, 2);
assert.equal(reviewCount, 2);
assert.ok(accepted.geometry.parts.some((part) => part.id === 'inner-light'));
console.log('Reference quality passed: aspect, crop, large grids, PNG depth, body timeout, negative visual review and revision.');
