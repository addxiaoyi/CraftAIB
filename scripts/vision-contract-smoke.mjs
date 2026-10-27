import assert from 'node:assert/strict';
import { analyzeReferencePixels, attachReferenceFeatures, compareReferenceFrontMask, createLitematicaPlannerInstruction, planBuilding, planBuildingWithModel, referenceMaterialColorFeedback, structurePlanJsonSchema, structurePlanToGrid, summarizeInteriorVoxelization } from '../packages/ai-planner/dist/index.js';
import { serializeLitematica } from '../packages/cartographer-adapter/dist/index.js';
import { parseLitematicaDocumentBytes } from '../packages/craftmatic-adapter/dist/index.js';
import { referenceSilhouetteFeedback } from '../packages/ai-planner/dist/vision.js';
const referenceAnalysisCall = (overrides = {}) => ({
  name: 'analyze_reference_image',
  arguments: JSON.stringify({
    object: 'ornate stone castle', category: 'building', silhouette: 'Tall central keep with stepped side towers.',
    visibleParts: ['central keep', 'left tower', 'right tower', 'stepped roof'], symmetry: 'bilateral', view: 'front',
    depthCues: ['visible side wall planes', 'roof eaves project beyond the walls'],
    ...overrides,
  }),
});
assert.match(createLitematicaPlannerInstruction(), /multi-region/);
assert.equal(structurePlanJsonSchema().required.includes('regions'), true);
assert.equal(structurePlanJsonSchema().required.includes('inference'), true);
assert.equal(structurePlanJsonSchema().required.includes('referenceFacing'), true, 'reference plans must declare the camera-facing elevation');
assertStrictObjects(structurePlanJsonSchema());
assert.match(createLitematicaPlannerInstruction(), /plain namespaced Minecraft block IDs only/);
const invalidPalettePlan = planBuilding({ prompt: 'gothic tower' });
invalidPalettePlan.palette.window = 'minecraft:glass_pane[east=true,north=true]';
const repairedPalettePlan = await planBuildingWithModel({ prompt: 'gothic tower' }, {
  endpoint: 'http://mock.invalid',
  maxRetries: 0,
  fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(invalidPalettePlan) } }] }), { status: 200 }),
});
assert.equal(repairedPalettePlan.palette.window, 'minecraft:glass_pane');
assert.match(repairedPalettePlan.notes.at(-1), /Auto-repaired vision response/);

const referencePixels = new Uint8Array(32 * 32 * 4);
for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
  const isBuilding = x >= 8 && x <= 23 && y >= 5 && y <= 27;
  const index = (y * 32 + x) * 4;
  const shade = isBuilding ? 35 : 235;
  referencePixels[index] = shade;
  referencePixels[index + 1] = shade;
  referencePixels[index + 2] = shade;
  referencePixels[index + 3] = 255;
}
const referenceFeatures = analyzeReferencePixels({ width: 32, height: 32, pixels: referencePixels });
const emptyBandFeedback = referenceSilhouetteFeedback({
  face: 'z-min', silhouette: 0.2, missing: 0.5, extra: 0.2, occupied: 0.5,
  generatedYMin: 37, generatedYMax: 84,
  referenceRows: ['........', '........', '####....', '####....'],
  generatedRows: ['####....', '####....', '........', '........'],
}, 256);
assert.match(emptyBandFeedback, /00 Y82-84:/, 'feedback Y ranges must map to occupied voxel height, not the full plan envelope');
assert.match(emptyBandFeedback, /15 Y37-39:/, 'bottom silhouette bands must map to the actual occupied Y minimum');
assert.match(emptyBandFeedback, /CHECK camera-facing overhang and trim only unsupported silhouette pixels/);
assert.doesNotMatch(emptyBandFeedback, /REMOVE generated voxels|remove that band|delete a complete Y slice/i, 'an empty 2D reference band must not request deletion of an entire voxel slice');
assert.match(emptyBandFeedback, /REF \d+\+\/-\d+\/BUILD EMPTY; ADD voxels centered near \d+/);
const shortBuildFeedback = referenceSilhouetteFeedback({
  face: 'z-min', silhouette: 0.2, missing: 0.5, extra: 0.2, occupied: 0.5,
  generatedYMin: 5, generatedYMax: 12,
  referenceRows: ['####....', '####....', '........', '........'],
  generatedRows: ['####....', '####....', '........', '........'],
});
for (const [, start, end] of shortBuildFeedback.matchAll(/Y(\d+)-(\d+)/g)) {
  assert.ok(Number(start) <= Number(end), 'short structures must not receive inverted Y intervals');
  assert.ok(Number(start) >= 5 && Number(end) <= 12, 'short structure bands must stay inside occupied Y bounds');
}
const noisyReferencePixels = referencePixels.slice();
const noiseIndex = (2 * 32 + 2) * 4;
noisyReferencePixels[noiseIndex] = 35;
noisyReferencePixels[noiseIndex + 1] = 35;
noisyReferencePixels[noiseIndex + 2] = 35;
const denoisedFeatures = analyzeReferencePixels({ width: 32, height: 32, pixels: noisyReferencePixels });
assert.deepEqual(denoisedFeatures.frontMask, referenceFeatures.frontMask, 'isolated foreground-color noise in the background must not expand the detected subject mask');
await assert.rejects(
  planBuildingWithModel({ prompt: 'Use this reference image.', referenceImage: { dataUrl: 'data:image/png;base64,AA==' } }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 0,
    fetcher: async () => { throw new Error('model must not be called without silhouette analysis'); },
  }),
  (error) => error?.code === 'REFERENCE_ANALYSIS_REQUIRED',
);
const referencePlan = attachReferenceFeatures(planBuilding({ prompt: 'small stone house', constraints: { width: 32, height: 46, length: 24, floors: 4 } }), referenceFeatures);
assert.equal(referencePlan.inference?.source, 'vision-model');
const modelGeometry = {
  ...referencePlan,
  referenceFacing: 'z-max',
  components: [],
  geometry: { parts: [{
    id: 'model-authored-volume', type: 'box', x: 4, y: 5, z: 3, width: 12, height: 18, length: 10,
    material: 'minecraft:emerald_block', hollow: false, thickness: 1, facing: null, openSides: [], roofStyle: 'flat', ridgeAxis: 'x', purpose: 'structure',
  }] },
};
const referenceGrid = structurePlanToGrid(modelGeometry);
assert.equal(referenceGrid.cells.length, 12 * 18 * 10, 'the model-authored volume should be voxelized without a pixel-mask facade being added');
assert.ok(referenceGrid.cells.every((cell) => cell.block.id === 'minecraft:emerald_block'), 'reference pixels must not overwrite model-authored materials or fabricate other faces');
const referenceMatch = compareReferenceFrontMask(modelGeometry, referenceGrid.cells);
assert.ok(referenceMatch, 'the image-derived silhouette remains available as a validation signal');
const fittedFront = [];
const referenceLeft = Math.floor(referenceFeatures.subjectBounds.left * referenceFeatures.maskWidth);
const referenceRight = Math.ceil(referenceFeatures.subjectBounds.right * referenceFeatures.maskWidth);
const referenceTop = Math.floor(referenceFeatures.subjectBounds.top * referenceFeatures.maskHeight);
const referenceBottom = Math.ceil(referenceFeatures.subjectBounds.bottom * referenceFeatures.maskHeight);
const fittedHeight = 22;
const fittedWidth = Math.round(fittedHeight * (referenceRight - referenceLeft) / (referenceBottom - referenceTop));
for (let row = 0; row < referenceFeatures.maskHeight; row += 1) for (let column = 0; column < referenceFeatures.maskWidth; column += 1) {
  if (referenceFeatures.frontMask[row * referenceFeatures.maskWidth + column] !== 1) continue;
  fittedFront.push({
    x: 6 + Math.floor((column - referenceLeft) * fittedWidth / (referenceRight - referenceLeft)),
    y: 4 + Math.floor((referenceBottom - 1 - row) * fittedHeight / (referenceBottom - referenceTop)),
    z: modelGeometry.dimensions.length - 1,
  });
}
const fittedPlan = { ...modelGeometry, referenceFeatures };
const fittedMatch = compareReferenceFrontMask(fittedPlan, fittedFront);
assert.ok(fittedMatch && fittedMatch.silhouette > 0.85, `front silhouette comparison should preserve voxel aspect while fitting the reference subject (${fittedMatch?.silhouette})`);
assert.ok(fittedMatch.referenceRows.length > 0 && fittedMatch.generatedRows.length > 0, 'silhouette comparison should return actionable row projections');
assert.equal(fittedMatch.generatedYMin, Math.min(...fittedFront.map((cell) => cell.y)), 'comparison must expose the occupied voxel Y minimum for actionable band feedback');
assert.equal(fittedMatch.generatedYMax, Math.max(...fittedFront.map((cell) => cell.y)), 'comparison must expose the occupied voxel Y maximum for actionable band feedback');
const insetVolume = fittedFront.flatMap((cell) => Array.from({ length: 5 }, (_, depth) => ({ ...cell, z: 3 + depth })));
const insetVolumeMatch = compareReferenceFrontMask({ ...fittedPlan, referenceFacing: 'z-min' }, insetVolume);
assert.ok((insetVolumeMatch?.silhouette ?? 0) > 0.85, 'silhouette matching must project the full occupied volume, not only its outermost voxel plane');
const fittedMinX = Math.min(...fittedFront.map((cell) => cell.x));
const fittedMaxX = Math.max(...fittedFront.map((cell) => cell.x));
const xFace = fittedFront.map(({ x, y }) => ({ x: 0, y, z: Math.floor((x - fittedMinX) * 15 / Math.max(1, fittedMaxX - fittedMinX)) + 6 }));
const xFacePlan = { ...fittedPlan, referenceFacing: 'x-min' };
const insetXFace = xFace.map((cell) => ({ ...cell, x: 5 }));
const xFaceMatch = compareReferenceFrontMask(xFacePlan, insetXFace);
assert.equal(xFaceMatch?.face, 'x-min', 'reference scoring must detect when the camera-facing elevation is placed on an X face');
assert.ok((xFaceMatch?.silhouette ?? 0) > 0.8, 'an image-matching X-face projection must not be scored as a zero-match Z face');
const squareMismatch = [];
for (let y = 0; y < 22; y += 1) for (let x = 0; x < 22; x += 1) squareMismatch.push({ x, y, z: 0 });
const ratioMismatch = compareReferenceFrontMask({ ...fittedPlan, referenceFacing: 'z-max' }, squareMismatch);
assert.ok(ratioMismatch && Number(ratioMismatch.generatedAspectRatio) > Number(ratioMismatch.referenceAspectRatio));
assert.ok(Number(ratioMismatch?.missing) > 0.18 || Number(ratioMismatch?.extra) > 0.2, 'a square voxel build must fail against a tall narrow reference instead of being anisotropically stretched');
const colorWidth = 16;
const colorHeight = 16;
const redReferenceFeatures = {
  ...referenceFeatures,
  maskWidth: colorWidth,
  maskHeight: colorHeight,
  subjectBounds: { left: 0, top: 0, right: 1, bottom: 1 },
  frontMask: Array.from({ length: colorWidth * colorHeight }, () => 1),
  colorMask: Array.from({ length: colorWidth * colorHeight }, (_, index) => index < colorWidth * colorHeight * 0.7 ? 0 : 1),
  colorPalette: [{ r: 224, g: 32, b: 24 }, { r: 210, g: 176, b: 24 }],
};
const darkColorCells = Array.from({ length: 100 }, () => ({ block: { id: 'minecraft:polished_deepslate' } }));
const missingColorFeedback = referenceMaterialColorFeedback(redReferenceFeatures, darkColorCells);
assert.match(missingColorFeedback ?? '', /red covers 70%.*only 0%/i, 'reference-dominant colors missing from the build must be rejected with measured proportions');
const redColorCells = [...Array.from({ length: 70 }, () => ({ block: { id: 'minecraft:red_concrete' } })), ...Array.from({ length: 30 }, () => ({ block: { id: 'minecraft:yellow_concrete' } }))];
assert.equal(referenceMaterialColorFeedback(redReferenceFeatures, redColorCells), undefined, 'a build preserving dominant reference color areas should pass color coverage');

let rejectedBuildCalls = 0;
const failedBuildEvents = [];
const invalidDimensionsPlan = { ...planBuilding({ prompt: 'small stone house' }), referenceFacing: 'z-max' };
await assert.rejects(
  planBuildingWithModel({
    prompt: 'Match the reference image.',
    constraints: { width: invalidDimensionsPlan.dimensions.width, height: invalidDimensionsPlan.dimensions.height + 1, length: invalidDimensionsPlan.dimensions.length, sizeMode: 'exact' },
    referenceImage: { dataUrl: 'data:image/png;base64,AA==', referenceFeatures },
  }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 0,
    onToolEvent: (event) => failedBuildEvents.push(event),
    fetcher: async (_url, init) => {
      const body = JSON.parse(init.body);
      const calledTools = body.messages.flatMap((message) => message.tool_calls ?? []).map((call) => call.function.name);
      const functionCall = !calledTools.includes('analyze_reference_image')
        ? referenceAnalysisCall()
        : !calledTools.includes('get_minecraft_blocks')
          ? { name: 'get_minecraft_blocks', arguments: '{"category":"all"}' }
          : (rejectedBuildCalls += 1, { name: 'build_voxel_structure', arguments: JSON.stringify({ plan: invalidDimensionsPlan }) });
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: `call-${calledTools.length}`, type: 'function', function: functionCall }] } }] }), { status: 200 });
    },
  }),
  (error) => error?.code === 'BUILD_VALIDATION_REPEATED' && /visual plan does not match the requested target size/i.test(error.message),
);
assert.equal(rejectedBuildCalls, 3, 'identical construction validation failures should stop after three attempts');
assert.equal(failedBuildEvents.filter((event) => event.stage === 'tool_result' && event.ok === false).length, 3);

const boundsFixPlan = {
  ...modelGeometry,
  geometry: { parts: [{ ...modelGeometry.geometry.parts[0], id: 'side_paper', x: modelGeometry.dimensions.width - 1, width: 2 }] },
};
let boundsBuilds = 0;
let sawBoundsRepairGuidance = false;
let sawMeasuredOutlineInInitialPrompt = false;
let sawMeasuredColorsInInitialPrompt = false;
let sawOriginalImageOnAnalysisCall = false;
await assert.rejects(
  planBuildingWithModel({ prompt: 'Build this reference image.', referenceImage: { dataUrl: 'data:image/png;base64,AA==', referenceFeatures } }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 0,
    fetcher: async (_url, init) => {
      const body = JSON.parse(init.body);
      const userText = body.messages.find((message) => message.role === 'user')?.content?.[0]?.text ?? '';
      sawMeasuredOutlineInInitialPrompt ||= /Measured front-silhouette span profile/.test(userText);
      sawMeasuredColorsInInitialPrompt ||= /Measured original-image foreground colors/.test(userText);
      if (body.tool_choice?.function?.name === 'analyze_reference_image') {
        sawOriginalImageOnAnalysisCall ||= body.messages.some((message) => message.role === 'user' && message.content?.some?.((part) => part.type === 'image_url'));
      }
      const previousCalls = body.messages.flatMap((message) => message.tool_calls ?? []).map((call) => call.function.name);
      const sawError = body.messages.some((message) => message.role === 'tool' && String(message.content).includes('side_paper'));
      if (sawError) {
        const toolReply = body.messages.findLast((message) => message.role === 'tool');
        const repair = JSON.parse(toolReply.content).feedback;
        sawBoundsRepairGuidance ||= /x\+width<=/.test(repair) && /move or shrink/i.test(repair);
      }
      const functionCall = !previousCalls.includes('analyze_reference_image')
        ? referenceAnalysisCall()
        : !previousCalls.includes('get_minecraft_blocks')
          ? { name: 'get_minecraft_blocks', arguments: '{"category":"all"}' }
          : (boundsBuilds += 1, { name: 'build_voxel_structure', arguments: JSON.stringify({ plan: { ...boundsFixPlan, geometry: { parts: boundsFixPlan.geometry.parts.map((part) => ({ ...part, material: 'minecraft:red_concrete' })) } } }) });
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: `bounds-${previousCalls.length}`, type: 'function', function: functionCall }] } }] }), { status: 200 });
    },
  }),
  (error) => error?.code === 'BUILD_VALIDATION_REPEATED' && /side_paper/i.test(error.message),
);
assert.equal(boundsBuilds, 3);
assert.equal(sawBoundsRepairGuidance, true, 'out-of-bounds geometry feedback should give exact dimension inequalities and a corrective action');
assert.equal(sawMeasuredOutlineInInitialPrompt, true, 'the model should receive compact reference silhouette measurements with the original image before its first build');
assert.equal(sawMeasuredColorsInInitialPrompt, true, 'the model should receive measured foreground colors and their image area shares');
assert.equal(sawOriginalImageOnAnalysisCall, true, 'the required analysis tool call must see the original image, not a text-only proxy');

let duplicateBuildCalls = 0;
let sawDuplicateGeometryFeedback = false;
const narrowReferenceMask = Array.from({ length: referenceFeatures.maskWidth * referenceFeatures.maskHeight }, () => 0);
for (let y = 5; y < 28; y += 1) narrowReferenceMask[y * referenceFeatures.maskWidth + 15] = 1;
const narrowReferenceFeatures = { ...referenceFeatures, frontMask: narrowReferenceMask };
await assert.rejects(
  planBuildingWithModel({ prompt: 'Reconstruct this lantern.', constraints: { includeInterior: false }, referenceImage: { dataUrl: 'data:image/png;base64,AA==', referenceFeatures: narrowReferenceFeatures } }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 0,
    fetcher: async (_url, init) => {
      const body = JSON.parse(init.body);
      const calledTools = body.messages.flatMap((message) => message.tool_calls ?? []).map((call) => call.function.name);
      const lastTool = body.messages.findLast((message) => message.role === 'tool');
      if (lastTool && /identical to previous build/.test(String(lastTool.content))) sawDuplicateGeometryFeedback = true;
      const nextCall = !calledTools.includes('analyze_reference_image')
        ? referenceAnalysisCall()
        : !calledTools.includes('get_minecraft_blocks')
          ? { name: 'get_minecraft_blocks', arguments: '{"category":"all"}' }
        : !calledTools.includes('build_voxel_structure')
          ? { name: 'build_voxel_structure', arguments: JSON.stringify({ plan: modelGeometry }) }
          : !calledTools.includes('inspect_voxel_structure')
            ? { name: 'inspect_voxel_structure', arguments: '{"buildId":"build-3-1"}' }
            : (duplicateBuildCalls += 1, { name: 'build_voxel_structure', arguments: JSON.stringify({ plan: modelGeometry }) });
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: `repeat-${calledTools.length}-${duplicateBuildCalls}`, type: 'function', function: nextCall }] } }] }), { status: 200 });
    },
  }),
  (error) => error?.code === 'BUILD_VALIDATION_REPEATED' && /identical to previous build/i.test(error.message),
);
assert.equal(duplicateBuildCalls, 3, 'the model must not spend the full turn budget repeating an unchanged 3D plan');
assert.equal(sawDuplicateGeometryFeedback, true, 'a repeated plan must receive its previous silhouette diagnostics and a request to change geometry');

const regionOnlyFailures = [];
let regionOnlyBuilds = 0;
await assert.rejects(
  planBuildingWithModel({ prompt: 'Build from this reference image.', referenceImage: { dataUrl: 'data:image/png;base64,AA==', referenceFeatures } }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 0,
    onToolEvent: (event) => { if (event.stage === 'tool_result' && event.ok === false) regionOnlyFailures.push(event); },
    fetcher: async (_url, init) => {
      const body = JSON.parse(init.body);
      const calledTools = body.messages.flatMap((message) => message.tool_calls ?? []).map((call) => call.function.name);
      const functionCall = !calledTools.includes('analyze_reference_image')
        ? referenceAnalysisCall()
        : !calledTools.includes('get_minecraft_blocks')
          ? { name: 'get_minecraft_blocks', arguments: '{"category":"all"}' }
          : (regionOnlyBuilds += 1, { name: 'build_voxel_structure', arguments: JSON.stringify({ plan: invalidDimensionsPlan }) });
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: `region-only-${calledTools.length}`, type: 'function', function: functionCall }] } }] }), { status: 200 });
    },
  }),
  (error) => error?.code === 'BUILD_VALIDATION_REPEATED' && /model-authored 3D geometry.parts/i.test(error.message),
);
assert.equal(regionOnlyBuilds, 3, 'a region-only reference plan must be rejected instead of receiving procedural facade geometry');
assert.equal(regionOnlyFailures.length, 3);

let stagnantBuildCalls = 0;
let stagnantInspectionCalls = 0;
const stagnantMask = Array.from({ length: referenceFeatures.maskWidth * referenceFeatures.maskHeight }, () => 0);
for (let y = 16; y < 30; y += 1) stagnantMask[y * referenceFeatures.maskWidth + 24] = 1;
const stagnantFeatures = { ...referenceFeatures, frontMask: stagnantMask };
const stagnantPlan = {
  ...modelGeometry,
  referenceFacing: 'z-max',
  geometry: { parts: [{ ...modelGeometry.geometry.parts[0], x: 0, y: 10, z: 0, width: 30, height: 20, length: 20 }] },
};
await assert.rejects(
  planBuildingWithModel({ prompt: 'Reconstruct this reference.', constraints: { includeInterior: false }, referenceImage: { dataUrl: 'data:image/png;base64,AA==', referenceFeatures: stagnantFeatures } }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 0,
    fetcher: async (_url, init) => {
      const body = JSON.parse(init.body);
      const calls = body.messages.flatMap((message) => message.tool_calls ?? []).map((call) => call.function.name);
      const next = !calls.includes('analyze_reference_image')
        ? referenceAnalysisCall()
        : !calls.includes('get_minecraft_blocks')
          ? { name: 'get_minecraft_blocks', arguments: '{"category":"all"}' }
        : calls.filter((name) => name === 'build_voxel_structure').length === calls.filter((name) => name === 'inspect_voxel_structure').length
          ? (stagnantBuildCalls += 1, { name: 'build_voxel_structure', arguments: JSON.stringify({ plan: { ...stagnantPlan, geometry: { parts: stagnantPlan.geometry.parts.map((part) => ({ ...part, z: stagnantBuildCalls - 1, length: 21 - stagnantBuildCalls })) } } }) })
          : (stagnantInspectionCalls += 1, { name: 'inspect_voxel_structure', arguments: JSON.stringify({ buildId: `build-${stagnantBuildCalls * 2 + 1}-${stagnantBuildCalls}` }) });
      return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: `stagnant-${calls.length}`, type: 'function', function: next }] } }] }), { status: 200 });
    },
  }),
  (error) => error?.code === 'REFERENCE_MATCH_STAGNANT'
    && /stopped early/i.test(error.message)
    && /NARROW by|WIDEN by/.test(error.message)
    && /Y\d+-\d+/.test(error.message)
    && !/d[WC] [+-](?:1[6-9]|[2-9]\d)\b/.test(error.message),
);
assert.equal(stagnantBuildCalls, 4, 'three consecutive inspected revisions without silhouette progress should stop early');
assert.equal(stagnantInspectionCalls, 4);

const lanternSource = planBuilding({ prompt: 'hanging lantern' });
const lanternChamber = {
  name: 'glowing lantern chamber', role: 'lantern body', x: 0, y: 0, z: 0,
  width: lanternSource.dimensions.width, height: lanternSource.dimensions.height, length: lanternSource.dimensions.length,
};
const lanternPlan = {
  ...lanternSource,
  referenceFacing: 'z-max',
  name: 'Ornate Display Object',
  type: 'decorative_object',
  floors: 1,
  rooms: [],
  regions: [lanternChamber],
  geometry: { parts: [{
    id: 'lantern-shell', type: 'shell', x: 0, y: 0, z: 0,
    width: lanternSource.dimensions.width, height: lanternSource.dimensions.height, length: lanternSource.dimensions.length,
    material: 'minecraft:dark_oak_planks', hollow: true, thickness: 1, facing: null, openSides: [], roofStyle: 'flat', ridgeAxis: 'x', purpose: 'structure',
  }, {
    id: 'decorative-interior-lantern', type: 'box', x: 2, y: 2, z: 2, width: 1, height: 1, length: 1,
    material: 'minecraft:lantern', hollow: false, thickness: 1, facing: null, openSides: [], roofStyle: 'flat', ridgeAxis: 'x', purpose: 'lighting',
  }] },
};
const lanternWidth = referenceFeatures.maskWidth;
const lanternHeight = referenceFeatures.maskHeight;
const lanternLeft = Math.floor(lanternWidth * 0.05);
const lanternRight = Math.ceil(lanternWidth * 0.95);
const lanternPixelWidth = lanternRight - lanternLeft;
const lanternPixelHeight = Math.max(1, Math.round(lanternPixelWidth / 2.4));
const lanternTop = Math.floor((lanternHeight - lanternPixelHeight) / 2);
const lanternBottom = lanternTop + lanternPixelHeight;
const lanternMask = Array.from({ length: lanternWidth * lanternHeight }, () => 0);
for (let y = lanternTop; y < lanternBottom; y += 1) for (let x = lanternLeft; x < lanternRight; x += 1) lanternMask[y * lanternWidth + x] = 1;
const lanternReferenceFeatures = {
  ...referenceFeatures,
  subjectBounds: { left: lanternLeft / lanternWidth, top: lanternTop / lanternHeight, right: lanternRight / lanternWidth, bottom: lanternBottom / lanternHeight },
  frontMask: lanternMask,
};
const calledLanternTools = new Set();
let lanternProjectionCount = 0;
const litLantern = await planBuildingWithModel({
  prompt: '灯笼',
  constraints: { includeInterior: true, detailLevel: 4, sizeMode: 'envelope' },
  referenceImage: { dataUrl: 'data:image/png;base64,AA==', referenceFeatures: lanternReferenceFeatures },
}, {
  endpoint: 'http://mock.invalid',
  maxRetries: 0,
  fetcher: async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.tool_choice?.function?.name === 'review_reference_structure') return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: 'visual-review', type: 'function', function: { name: 'review_reference_structure', arguments: JSON.stringify({ buildId: 'build-3-1', matchesReference: true, mismatches: [], summary: 'Housing, frame, crown and hanging detail match the fixture reference.' }) } }] } }] }), { status: 200 });
    const previousCalls = body.messages.flatMap((message) => message.tool_calls ?? []).map((call) => call.function.name);
    previousCalls.forEach((name) => calledLanternTools.add(name));
    const nextTool = !calledLanternTools.has('analyze_reference_image')
      ? referenceAnalysisCall({ object: 'hanging lantern', category: 'object', silhouette: 'Wide housing with a narrow crown and hanging finial.', visibleParts: ['housing', 'frame', 'translucent panels', 'crown', 'chain'], symmetry: 'bilateral', view: 'front', depthCues: ['side frame depth', 'hollow housing cavity'] })
      : !calledLanternTools.has('get_minecraft_blocks')
        ? { name: 'get_minecraft_blocks', arguments: '{"category":"all"}' }
      : !calledLanternTools.has('build_voxel_structure')
        ? { name: 'build_voxel_structure', arguments: JSON.stringify({ plan: lanternPlan }) }
        : !calledLanternTools.has('build_volume_layer')
          ? { name: 'build_volume_layer', arguments: '{"buildId":"build-3-1"}' }
        : lanternProjectionCount < 4
          ? (lanternProjectionCount += 1, { name: 'inspect_projection', arguments: JSON.stringify({ buildId: 'build-3-1', view: ['front', 'side', 'rear', 'top'][lanternProjectionCount - 1] }) })
        : !calledLanternTools.has('inspect_interior')
          ? { name: 'inspect_interior', arguments: '{"buildId":"build-3-1"}' }
        : !calledLanternTools.has('inspect_voxel_structure')
          ? { name: 'inspect_voxel_structure', arguments: '{"buildId":"build-3-1"}' }
        : !calledLanternTools.has('review_reference_structure')
          ? { name: 'review_reference_structure', arguments: JSON.stringify({ buildId: 'build-3-1', matchesReference: true, mismatches: [], summary: 'Housing, frame, crown and hanging detail match the fixture reference.' }) }
          : { name: 'finish_structure', arguments: '{"buildId":"build-3-1"}' };
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: `lantern-${previousCalls.length}`, type: 'function', function: nextTool }] } }] }), { status: 200 });
  },
});
assert.ok(litLantern.geometry.parts.some((part) => part.id === 'generated-lantern-light-core' && part.material === 'minecraft:sea_lantern'));
const litLanternGrid = structurePlanToGrid(litLantern);
assert.ok(litLanternGrid.cells.some((cell) => cell.block.id === 'minecraft:sea_lantern' && cell.x > lanternChamber.x && cell.x < lanternChamber.x + lanternChamber.width - 1 && cell.y > lanternChamber.y && cell.y < lanternChamber.y + lanternChamber.height - 1 && cell.z > lanternChamber.z && cell.z < lanternChamber.z + lanternChamber.length - 1), 'a high-detail lantern must contain an actual light block inside its chamber');
const lanternInteriorAudit = summarizeInteriorVoxelization(litLantern, litLanternGrid.cells, '灯笼');
assert.ok(lanternInteriorAudit.occupiedBlocks >= 1 && lanternInteriorAudit.lightBlocks >= 1, 'lantern interior metrics must inspect the chamber instead of unrelated room labels');
const lanternLitematic = await serializeLitematica(litLanternGrid, { name: litLantern.name });
const lanternDocument = await parseLitematicaDocumentBytes(lanternLitematic);
assert.equal(lanternDocument.regions.reduce((total, region) => total + region.cells.length, 0), litLanternGrid.cells.length);
assert.ok(lanternDocument.regions.some((region) => region.cells.some((cell) => cell.block.id === 'minecraft:sea_lantern')), 'the interior light core must survive Litematic export and re-import');
await assert.rejects(
  planBuildingWithModel({ prompt: 'tower' }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 0,
    maxRepairAttempts: 0,
    fetcher: async () => new Response('{not-json', { status: 200, headers: { 'content-type': 'application/json' } }),
  }),
  /invalid JSON/i,
);
await assert.rejects(
  planBuildingWithModel({ prompt: 'tower' }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 1,
    retryDelayMs: 0,
    fetcher: async () => { throw new Error('upstream timeout'); },
  }),
  (error) => error?.code === 'MODEL_REQUEST_FAILED' && /could not connect/i.test(error.message),
);
await assert.rejects(
  planBuildingWithModel({ prompt: 'tower' }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 0,
    requestTimeoutMs: 1000,
    fetcher: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }),
  }),
  /timed out after 1000ms/i,
);
const transportEvents = [];
await assert.rejects(
  planBuildingWithModel({ prompt: 'tower' }, {
    endpoint: 'https://mock.invalid/v1/chat/completions',
    maxRetries: 0,
    onToolEvent: (event) => transportEvents.push(event),
    fetcher: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: new Error('EE certificate key too weak') }); },
  }),
  (error) => error?.code === 'MODEL_TLS_CERTIFICATE_INVALID' && /TLS certificate uses a key/i.test(error.message),
);
assert.ok(transportEvents.some((event) => event.stage === 'model_error' && event.ok === false && /TLS certificate/i.test(event.message)), 'transport failures must appear in the construction log');
console.log('vision contract passed');

function assertStrictObjects(schema) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, 'strict object schemas must reject additional properties');
    assert.deepEqual(new Set(schema.required), new Set(Object.keys(schema.properties ?? {})), 'every strict object property must be required');
  }
  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) value.forEach(assertStrictObjects);
    else if (value && typeof value === 'object') assertStrictObjects(value);
  }
}
