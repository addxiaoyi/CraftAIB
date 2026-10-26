import { attachReferenceFeatures, compareReferenceFrontMask, createLitematicaPlannerInstruction, structurePlanToGrid, validateStructurePlan, type BuildingPrompt, type GeometryPart, type ReferenceFeatures, type RoomPlan, type StructurePlan, type StructureRegionPlan } from './index.js';

export type VisionPlannerOptions = {
  endpoint: string;
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
  maxRepairAttempts?: number;
  strictSchema?: boolean;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  onToolEvent?: (event: ToolExecutionEvent) => void;
  renderPreview?: (grid: ReturnType<typeof structurePlanToGrid>, plan: StructurePlan) => Promise<string> | string;
};

export type ToolExecutionEvent = {
  stage: 'model_request' | 'model_wait' | 'model_retry' | 'tool_call' | 'tool_result' | 'model_error';
  turn: number;
  tool?: string;
  ok?: boolean;
  blocks?: number;
  regions?: number;
  silhouette?: number;
  interiorBlocks?: number;
  interiorLights?: number;
  message?: string;
};

type ReferenceImageAnalysis = {
  object: string;
  category: 'building' | 'object' | 'vehicle' | 'creature' | 'landscape' | 'other';
  silhouette: string;
  visibleParts: string[];
  symmetry: 'bilateral' | 'rotational' | 'asymmetric' | 'unclear';
  view: 'front' | 'three-quarter' | 'side' | 'top' | 'isometric' | 'unclear';
  depthCues: string[];
};

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const MAX_BUILD_TOOL_TURNS = 22;
const MAX_IDENTICAL_BUILD_FAILURES = 3;
const MAX_STAGNANT_REFERENCE_INSPECTIONS = 3;
const MIN_REFERENCE_PROGRESS = 0.005;

export function summarizeInteriorVoxelization(
  plan: StructurePlan,
  cells: ReadonlyArray<{ x: number; y: number; z: number; block: { id: string } }>,
  identityHint = `${plan.type} ${plan.name}`,
) {
  const isLightFixture = /\blantern\b|\blamp\b|chandelier|\u706f\u7b3c|\u540a\u706f|\u706f\u5177/i.test(identityHint);
  const lightChamber = isLightFixture
    ? plan.regions.find((region) => region.width >= 3 && region.height >= 3 && region.length >= 3 && /chamber|interior|lantern body/i.test(`${region.name} ${region.role}`))
      ?? plan.regions.filter((region) => region.width >= 3 && region.height >= 3 && region.length >= 3 && !/roof|spire|dome|battlement|apron|crown|tassel/i.test(`${region.name} ${region.role}`)).sort((a, b) => b.width * b.height * b.length - a.width * a.height * a.length)[0]
      ?? { x: 0, y: 0, z: 0, ...plan.dimensions }
    : undefined;
  const bounds = lightChamber ? [lightChamber] : plan.rooms.length ? plan.rooms : plan.regions.filter((region) => /room|chamber|interior|hall|residence|atrium|kitchen|bedroom/i.test(`${region.name} ${region.role}`));
  const area = bounds.reduce((largest, candidate) => (candidate.width - 2) * (candidate.height - 2) * (candidate.length - 2) > (largest.width - 2) * (largest.height - 2) * (largest.length - 2) ? candidate : largest, bounds[0]);
  const inside = (cell: { x: number; y: number; z: number }, area: { x: number; y: number; z: number; width: number; height: number; length: number }) =>
    cell.x > area.x && cell.x < area.x + area.width - 1
    && cell.y > area.y && cell.y < area.y + area.height - 1
    && cell.z > area.z && cell.z < area.z + area.length - 1;
  const interiorVolume = area ? Math.max(0, area.width - 2) * Math.max(0, area.height - 2) * Math.max(0, area.length - 2) : 0;
  const interiorCells = area ? cells.filter((cell) => inside(cell, area)) : [];
  const lightBlockIds = new Set(['minecraft:lantern', 'minecraft:soul_lantern', 'minecraft:sea_lantern', 'minecraft:glowstone', 'minecraft:shroomlight', 'minecraft:ochre_froglight', 'minecraft:pearlescent_froglight', 'minecraft:verdant_froglight', 'minecraft:end_rod']);
  const lights = interiorCells.filter((cell) => lightBlockIds.has(cell.block.id)).length;
  return { regions: bounds.length, volume: interiorVolume, occupiedBlocks: interiorCells.length, lightBlocks: lights };
}
export const ARCHITECTURAL_AESTHETIC_SKILL = `
ARCHITECTURAL AESTHETIC SKILL
Goal: make a deliberate, beautiful Minecraft structure that reads clearly from far away and rewards close inspection.

1. Read the reference before designing. Identify the primary silhouette, visual center, dominant axis, scale, negative space, major masses, roof or cap, repeated motifs, materials, color hierarchy, camera angle and visible depth cues. Treat the image as evidence for your own 3D design, never as a 2D mask to extrude or copy onto every side. Preserve its visible facts.
2. Establish hierarchy. Use one main mass, one focal feature and a small number of supporting accents. Do not give every part equal visual weight. Keep a readable silhouette at thumbnail scale.
3. Control proportion. Use a coherent base, body, transition and crown. Align windows, beams, columns, stairs and trim to a shared module. Avoid accidental tiering, random setbacks, thin floating plates and noisy over-segmentation.
4. Build depth. Use foundation, wall plane, frame, recess, projection, eave and ornament layers. Openings must be real voids or transparent blocks with lintels, sills and structural edges.
5. Use materials intentionally. Select a dominant material, a secondary material, a restrained accent and a light source. Keep palette contrast clear; reserve rare colors for focal details. Match the reference color relationships, not just individual color names.
6. Add detail with rhythm and variation. Repeat motifs with consistent spacing, then vary corners, entrances, roof edges and focal areas. Detail should explain structure, use real Minecraft blocks and never obscure the main form.
7. Conceive the complete 3D assembly before placing blocks. Estimate width, height and depth from perspective, exposed side planes, shadows, repeated modules and structural use; when depth is occluded, choose a plausible depth for the object rather than a one-block extrusion. Decide whether the reference is bilateral, rotational or intentionally asymmetric and carry that design logic through the back, both sides, top, underside and interior. Continue materials and motifs around corners; do not paste the same front texture onto unseen faces. For buildings, infer reachable rooms, circulation, storage, lighting and service spaces. For objects, infer a complete solid assembly without inventing unrelated rooms or floors.
8. Check construction quality. No unsupported floating masses, disconnected stairs, impossible overhangs, paper-thin shells, exposed hollow cavities, abrupt material changes or empty placeholder boxes. Prefer a simpler coherent form over detail that breaks structure.
9. Before finishing, inspect front, side and top projections, occupied depth, x/z mirror-match metrics, block counts, region bounds and material counts. Compare the visible projection with the original image; use side/top projections to judge whether your own volume interpretation is coherent. Revise mismatches. A valid JSON plan is not finished until its executed voxel result is visually coherent.
10. Construct only through the provided function tools. Never return or execute JavaScript or another build script. Use only block IDs returned by get_minecraft_blocks, integer zero-based coordinates within the declared dimensions, and named parts with explicit structural purposes.
11. Treat each build as an executable construction contract: declare the occupied envelope, divide it into connected named components, place foundations before supported masses, and use explicit block states for stairs, doors, trapdoors, panes and directional blocks. Do not describe a part without assigning geometry and a catalog block ID.
`.trim();
const BUILDING_BLOCK_CATALOG = {
  masonry: ['minecraft:stone_bricks', 'minecraft:cracked_stone_bricks', 'minecraft:mossy_stone_bricks', 'minecraft:bricks', 'minecraft:quartz_bricks', 'minecraft:polished_tuff', 'minecraft:tuff_bricks', 'minecraft:chiseled_stone_bricks', 'minecraft:deepslate_bricks', 'minecraft:polished_blackstone_bricks'],
  wood: ['minecraft:oak_planks', 'minecraft:spruce_planks', 'minecraft:dark_oak_planks', 'minecraft:mangrove_planks', 'minecraft:cherry_planks', 'minecraft:bamboo_planks', 'minecraft:oak_log', 'minecraft:stripped_spruce_log'],
  roofs: ['minecraft:deepslate_tiles', 'minecraft:dark_prismarine', 'minecraft:oxidized_cut_copper', 'minecraft:cut_copper', 'minecraft:dark_oak_stairs', 'minecraft:stone_brick_stairs', 'minecraft:deepslate_tile_stairs', 'minecraft:brick_stairs'],
  openings: ['minecraft:glass_pane', 'minecraft:white_stained_glass_pane', 'minecraft:iron_bars', 'minecraft:oak_door', 'minecraft:spruce_door', 'minecraft:dark_oak_trapdoor', 'minecraft:iron_trapdoor'],
  detail: ['minecraft:lantern', 'minecraft:soul_lantern', 'minecraft:chain', 'minecraft:lightning_rod', 'minecraft:chiseled_bookshelf', 'minecraft:flower_pot', 'minecraft:sea_lantern'],
  colors: [
    'minecraft:red_concrete', 'minecraft:orange_concrete', 'minecraft:yellow_concrete', 'minecraft:lime_concrete', 'minecraft:green_concrete', 'minecraft:cyan_concrete', 'minecraft:light_blue_concrete', 'minecraft:blue_concrete', 'minecraft:purple_concrete', 'minecraft:magenta_concrete', 'minecraft:pink_concrete', 'minecraft:white_concrete', 'minecraft:light_gray_concrete', 'minecraft:gray_concrete', 'minecraft:black_concrete', 'minecraft:brown_concrete',
    'minecraft:red_terracotta', 'minecraft:orange_terracotta', 'minecraft:yellow_terracotta', 'minecraft:brown_terracotta', 'minecraft:white_terracotta', 'minecraft:black_terracotta',
    'minecraft:red_wool', 'minecraft:orange_wool', 'minecraft:yellow_wool', 'minecraft:green_wool', 'minecraft:blue_wool', 'minecraft:purple_wool', 'minecraft:pink_wool', 'minecraft:white_wool', 'minecraft:black_wool',
    'minecraft:red_stained_glass', 'minecraft:orange_stained_glass', 'minecraft:yellow_stained_glass', 'minecraft:green_stained_glass', 'minecraft:cyan_stained_glass', 'minecraft:light_blue_stained_glass', 'minecraft:blue_stained_glass', 'minecraft:purple_stained_glass', 'minecraft:magenta_stained_glass', 'minecraft:pink_stained_glass', 'minecraft:white_stained_glass',
    'minecraft:gold_block', 'minecraft:iron_block', 'minecraft:copper_block', 'minecraft:crimson_planks', 'minecraft:warped_planks',
  ],
} as const;

export function structurePlanJsonSchema() {
  return {
    ...STRUCTURE_PLAN_SCHEMA,
    required: [...STRUCTURE_PLAN_SCHEMA.required, 'geometry', 'inference', 'referenceFacing'],
    properties: {
      ...STRUCTURE_PLAN_SCHEMA.properties,
      referenceFacing: { type: 'string', enum: ['x-min', 'x-max', 'z-min', 'z-max'] },
      geometry: {
        type: 'object',
        additionalProperties: false,
        required: ['parts'],
        properties: {
          parts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'type', 'x', 'y', 'z', 'width', 'height', 'length', 'material', 'hollow', 'thickness', 'facing', 'openSides', 'roofStyle', 'ridgeAxis', 'purpose'],
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['box', 'shell', 'roof', 'cylinder', 'arch', 'stairs', 'beam', 'surface'] },
                x: { type: 'integer' }, y: { type: 'integer' }, z: { type: 'integer' },
                width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, length: { type: 'integer', minimum: 1 },
                material: { type: 'string' },
                hollow: { type: ['boolean', 'null'] },
                thickness: { type: ['integer', 'null'], minimum: 1 },
                facing: { type: ['string', 'null'], enum: ['north', 'south', 'east', 'west', null] },
                openSides: { type: ['array', 'null'], items: { type: 'string', enum: ['north', 'south', 'east', 'west', 'top', 'bottom'] } },
                roofStyle: { type: ['string', 'null'], enum: ['flat', 'gable', 'hip', 'mansard', 'dome', 'pavilion', null] },
                purpose: { type: ['string', 'null'], enum: ['structure', 'roof', 'room', 'partition', 'circulation', 'furniture', 'lighting', 'opening', 'decoration', null] },
                ridgeAxis: { type: ['string', 'null'], enum: ['x', 'z', null] },

              },
            },
          },
        },
      },
      inference: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'detectedType', 'detectedStyle', 'confidence', 'reasoning'],
        properties: {
          source: { type: 'string', enum: ['prompt', 'reference-heuristic', 'vision-model'] },
          detectedType: { type: ['string', 'null'] },
          detectedStyle: { type: ['string', 'null'] },
          confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          reasoning: { type: ['string', 'null'] },
        },
      },
    },
  };
}

const COMPONENT_OPTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['facing', 'count', 'overhang', 'size', 'floors'],
  properties: {
    facing: { type: ['string', 'null'] },
    count: { type: ['integer', 'null'] },
    overhang: { type: ['integer', 'null'] },
    size: { type: ['integer', 'null'] },
    floors: { type: ['integer', 'null'] },
  },
} as const;

const STRUCTURE_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'name', 'type', 'style', 'dimensions', 'floors', 'rooms', 'regions', 'components', 'palette', 'seed', 'notes'],
  properties: {
    version: { type: 'integer', const: 1 },
    name: { type: 'string' },
    type: { type: 'string' },
    style: { type: 'string' },
    dimensions: { type: 'object', additionalProperties: false, required: ['width', 'height', 'length'], properties: { width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, length: { type: 'integer', minimum: 1 } } },
    floors: { type: 'integer', minimum: 1 },
    rooms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'type', 'floor', 'x', 'y', 'z', 'width', 'height', 'length'], properties: { id: { type: 'string' }, type: { type: 'string' }, floor: { type: 'integer' }, x: { type: 'integer' }, y: { type: 'integer' }, z: { type: 'integer' }, width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, length: { type: 'integer', minimum: 1 } } } },
    regions: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['name', 'role', 'x', 'y', 'z', 'width', 'height', 'length'], properties: { name: { type: 'string' }, role: { type: 'string' }, x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 }, z: { type: 'integer', minimum: 0 }, width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, length: { type: 'integer', minimum: 1 } } } },
    components: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'type', 'x', 'y', 'z', 'options'], properties: { id: { type: 'string' }, type: { type: 'string' }, x: { type: 'integer' }, y: { type: 'integer' }, z: { type: 'integer' }, options: COMPONENT_OPTIONS_SCHEMA } } },
    palette: { type: 'object', additionalProperties: false, required: ['wall', 'floor', 'roof', 'window'], properties: { wall: { type: 'string', pattern: '^([a-z0-9_.-]+:)?[a-z0-9_./-]+$' }, floor: { type: 'string', pattern: '^([a-z0-9_.-]+:)?[a-z0-9_./-]+$' }, roof: { type: 'string', pattern: '^([a-z0-9_.-]+:)?[a-z0-9_./-]+$' }, window: { type: 'string', pattern: '^([a-z0-9_.-]+:)?[a-z0-9_./-]+$' } } },
    seed: { type: 'integer' },
    notes: { type: 'array', items: { type: 'string' } },
  },
} as const;

export async function planBuildingWithVision(input: BuildingPrompt, options: VisionPlannerOptions): Promise<StructurePlan> {
  if (!input.referenceImage?.dataUrl && !input.referenceImage?.url) throw new Error('Vision planning requires referenceImage.dataUrl or referenceImage.url.');
  return planBuildingWithModel(input, options);
}

export async function planBuildingWithModel(input: BuildingPrompt, options: VisionPlannerOptions): Promise<StructurePlan> {
  const imageUrl = input.referenceImage?.dataUrl ?? input.referenceImage?.url;
  if (!input.prompt?.trim() && !imageUrl) throw new Error('A building description or reference image is required.');
  if (imageUrl) assertReferenceFeatures(input.referenceImage?.referenceFeatures);
  if (!options.endpoint?.trim()) throw new Error('Vision planner endpoint is required.');

  const fetcher = options.fetcher ?? fetch;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;
  const request = buildRequest(input, imageUrl, options.model, options.strictSchema !== false);
  const requestTimeoutMs = Math.max(1000, Math.floor(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS));
  const retries = Math.max(0, Math.min(5, Math.floor(options.maxRetries ?? DEFAULT_RETRIES)));
  const totalBudgetMs = Math.min(900_000, requestTimeoutMs * (retries + 1) * MAX_BUILD_TOOL_TURNS);
  const deadline = new AbortController();
  let deadlineReached = false;
  const deadlineTimer = setTimeout(() => { deadlineReached = true; deadline.abort(); }, totalBudgetMs);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
  try {
    return await runBuildToolLoop(input, imageUrl, options, fetcher, headers, request, signal);
  } catch (error) {
    if (deadlineReached && !options.signal?.aborted) {
      throw Object.assign(new Error(`The building agent exceeded its ${Math.ceil(totalBudgetMs / 60000)} minute time budget. Retry with a smaller structure or fewer details.`), { statusCode: 504, code: 'MODEL_TIMEOUT' });
    }
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
  }
}

function assertReferenceFeatures(features: ReferenceFeatures | undefined): asserts features is ReferenceFeatures {
  if (!features || !Number.isInteger(features.maskWidth) || !Number.isInteger(features.maskHeight)
    || features.maskWidth < 8 || features.maskHeight < 8 || features.maskWidth > 128 || features.maskHeight > 128
    || !Array.isArray(features.frontMask) || features.frontMask.length !== features.maskWidth * features.maskHeight
    || !features.subjectBounds || ![features.subjectBounds.left, features.subjectBounds.top, features.subjectBounds.right, features.subjectBounds.bottom].every(Number.isFinite)
    || features.subjectBounds.left < 0 || features.subjectBounds.top < 0 || features.subjectBounds.right > 1 || features.subjectBounds.bottom > 1
    || features.subjectBounds.right <= features.subjectBounds.left || features.subjectBounds.bottom <= features.subjectBounds.top) {
    throw Object.assign(new Error('Reference-image analysis is missing or invalid. Reload the image and retry; strict generation requires a usable silhouette mask.'), { statusCode: 422, code: 'REFERENCE_ANALYSIS_REQUIRED' });
  }
}

async function runBuildToolLoop(
  input: BuildingPrompt,
  imageUrl: string | undefined,
  options: VisionPlannerOptions,
  fetcher: typeof fetch,
  headers: Record<string, string>,
  request: ReturnType<typeof buildRequest>,
  signal: AbortSignal,
): Promise<StructurePlan> {
  const messages: any[] = [...request.messages];
  const builds = new Map<string, { plan: StructurePlan; grid: ReturnType<typeof structurePlanToGrid>; signature: string }>();
  const inspectedBuilds = new Set<string>();
  const reviewedBuilds = new Set<string>();
  const rejectedReviews = new Set<string>();
  let catalogProvided = false;
  let referenceAnalysis: ReferenceImageAnalysis | undefined;
  let latestBuildId = '';
  let lastBuildFailure = '';
  let identicalBuildFailures = 0;
  let bestReferenceScore = Number.NEGATIVE_INFINITY;
  let stagnantReferenceInspections = 0;

  for (let turn = 1; turn <= MAX_BUILD_TOOL_TURNS; turn += 1) {
    const catalogSeenByModel = catalogProvided;
    const inspectionsSeenByModel = new Set(inspectedBuilds);
    const inspectedLatest = latestBuildId ? builds.get(latestBuildId) : undefined;
    const latestReferenceMatch = inspectedLatest && inspectedBuilds.has(latestBuildId)
      ? compareReferenceFrontMask(inspectedLatest.plan, inspectedLatest.grid.cells)
      : null;
    const referencePasses = !imageUrl || !latestReferenceMatch || passesReferenceMatch(latestReferenceMatch);
    if (inspectedLatest && inspectedBuilds.has(latestBuildId) && referencePasses && (!imageUrl || reviewedBuilds.has(latestBuildId))) {
      return finalizeInspectedBuild(inspectedLatest.plan, input, imageUrl, turn);
    }
    const requiredTool = !imageUrl
      ? undefined
      : !referenceAnalysis
        ? 'analyze_reference_image'
        : !catalogProvided
        ? 'get_minecraft_blocks'
        : !latestBuildId
          ? 'build_voxel_structure'
          : rejectedReviews.has(latestBuildId)
            ? 'build_voxel_structure'
          : !inspectedBuilds.has(latestBuildId)
            ? 'inspect_voxel_structure'
            : referencePasses
              ? 'review_reference_structure'
              : 'build_voxel_structure';
    const toolChoice = requiredTool
      ? { type: 'function', function: { name: requiredTool } }
      : 'auto';
    options.onToolEvent?.({ stage: 'model_request', turn, tool: requiredTool ?? 'model decision' });
    const requestedAt = Date.now();
    const waiting = setInterval(() => options.onToolEvent?.({ stage: 'model_wait', turn, tool: requiredTool ?? 'model decision', message: `Waiting for the model response: ${Math.floor((Date.now() - requestedAt) / 1000)}s elapsed.` }), 15000);
    let response: Response;
    try {
      response = await requestWithRetry(
        normalizeChatEndpoint(options.endpoint),
        headers,
        { ...request, tool_choice: toolChoice, messages },
        fetcher,
        { ...options, signal, onToolEvent: (event) => options.onToolEvent?.({ ...event, turn, tool: requiredTool ?? 'model decision' }) },
      );
    } catch (error) {
      options.onToolEvent?.({ stage: 'model_error', turn, ok: false, message: error instanceof Error ? error.message : 'The model request failed before responding.' });
      throw error;
    } finally {
      clearInterval(waiting);
    }
    const rawResponse = await response.text();
    let assistantMessage: any;
    try {
      assistantMessage = parseToolResponse(rawResponse);
    } catch (error) {
      if (!/no construction-tool calls|tool calling/i.test(error instanceof Error ? error.message : '')) {
        options.onToolEvent?.({ stage: 'model_error', turn, ok: false, message: error instanceof Error ? error.message : 'Model response could not be parsed.' });
        throw error;
      }
      options.onToolEvent?.({ stage: 'model_error', turn, ok: false, message: error instanceof Error ? error.message : 'Model omitted required tool calls.' });
      if (imageUrl) {
        const inspected = builds.get(latestBuildId);
        const match = inspectedBuilds.has(latestBuildId) && inspected
          ? compareReferenceFrontMask(inspected.plan, inspected.grid.cells)
          : null;
        if (inspected && reviewedBuilds.has(latestBuildId) && inspectedBuilds.has(latestBuildId) && (!match || passesReferenceMatch(match))) {
          return {
            ...attachReferenceFeatures(inspected.plan, input.referenceImage?.referenceFeatures),
            notes: [...inspected.plan.notes, `The model returned no further tool call after inspection in turn ${turn}; the inspected build was finalized.`],
          };
        }
        const stage = requiredTool ?? 'finish_structure or a revision';
        throw Object.assign(new Error(`The model passed the tool-call capability probe but did not call the required construction tool '${stage}'. Retry once or check provider tool-call behavior for this model.`), { statusCode: 422, code: 'MODEL_TOOL_CALL_MISSING' });
      }
      const fallbackResponse = await requestWithRetry(
        normalizeChatEndpoint(options.endpoint),
        headers,
        {
          model: options.model ?? 'gpt-4o-mini',
          temperature: 0,
          response_format: { type: 'json_schema', json_schema: { name: 'structure_plan', strict: true, schema: structurePlanJsonSchema() } },
          messages: request.messages,
        },
        fetcher,
        { ...options, signal },
      );
      const fallbackPlan = prepareModelPlan(parseVisionResponse(await fallbackResponse.text()), imageUrl, input.constraints, input.referenceImage?.referenceFeatures, input.prompt);
      return {
        ...attachReferenceFeatures(fallbackPlan, input.referenceImage?.referenceFeatures),
        notes: [...fallbackPlan.notes, 'The configured endpoint did not support tool calls; used validated single-pass compatibility mode.'],
      };
    }
    const calls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];
    if (!calls.length) throw new Error('The building model returned no construction-tool call.');
    messages.push(assistantMessage);

    const visualFeedback: any[] = [];
    for (const call of calls) {
      const toolCallId = String(call.id ?? `tool-${turn}-${messages.length}`);
      const toolName = call.function?.name;
      options.onToolEvent?.({ stage: 'tool_call', turn, tool: toolName });
      let args: any;
      try {
        args = JSON.parse(call.function?.arguments ?? '{}');
      } catch {
        messages.push(toolResult(toolCallId, { ok: false, error: 'Tool arguments must be valid JSON.' }));
        continue;
      }

      if (toolName === 'build_voxel_structure') {
        if (imageUrl && !referenceAnalysis) {
          messages.push(toolResult(toolCallId, { ok: false, error: 'Analyze the original reference image with analyze_reference_image before constructing.' }));
          continue;
        }
        if (imageUrl && !catalogSeenByModel) {
          messages.push(toolResult(toolCallId, { ok: false, error: 'Call get_minecraft_blocks first and use the returned vanilla block IDs when selecting materials.' }));
          continue;
        }
        try {
          let candidate = prepareModelPlan(args.plan, imageUrl, input.constraints, input.referenceImage?.referenceFeatures, input.prompt);
          if (imageUrl && referenceAnalysis) applyReferenceImageAnalysis(candidate, referenceAnalysis);
          if (imageUrl) candidate = addRequestedInterior(candidate, input.constraints, `${input.prompt} ${candidate.type} ${candidate.name}`);
          if (imageUrl && referenceAnalysis?.category === 'object' && (candidate.rooms.length > 0 || candidate.floors > 1)) {
            throw new Error(`The reference was identified as an object (${referenceAnalysis.object}), but this plan adds building floors or rooms. Reconstruct the pictured object and its visible parts instead of inventing habitable architecture.`);
          }
          const grid = structurePlanToGrid(candidate);
          if (imageUrl) {
            const colorMismatch = referenceMaterialColorFeedback(input.referenceImage?.referenceFeatures, grid.cells);
            // Name-based palette estimates are advisory: hidden solid cores distort color shares.
            if (colorMismatch) options.onToolEvent?.({ stage: 'tool_result', turn, tool: 'reference_material_review', ok: false, message: colorMismatch });
          }
          const spatial = summarizeSpatialStructure(grid.cells, grid.width, grid.height, grid.length);
          if (imageUrl && Math.min(spatial.occupiedSize.width, spatial.occupiedSize.height, spatial.occupiedSize.length) < 3) {
            throw new Error('The reference build is still facade-like. Construct a volumetric 3D body with at least 3 occupied blocks in width, height and depth, then inspect all projections.');
          }
          const interior = summarizeInteriorVoxelization(candidate, grid.cells, `${input.prompt} ${candidate.type} ${candidate.name}`);
          const signature = structurePlanSignature(candidate);
          const duplicate = imageUrl ? [...builds.entries()].find(([, build]) => build.signature === signature) : undefined;
          if (duplicate) {
            const previousMatch = compareReferenceFrontMask(duplicate[1].plan, duplicate[1].grid.cells);
            throw new Error(`This geometry is identical to previous build ${duplicate[0]}; it will not improve the result. ${referenceSilhouetteFeedback(previousMatch, duplicate[1].plan.dimensions.height)} Change the camera-facing geometry parts and coordinates before rebuilding.`);
          }
          latestBuildId = `build-${turn}-${builds.size + 1}`;
          builds.set(latestBuildId, { plan: candidate, grid, signature });
          lastBuildFailure = '';
          identicalBuildFailures = 0;
          if (!imageUrl) {
            options.onToolEvent?.({ stage: 'tool_result', turn, tool: toolName, ok: true, blocks: grid.cells.length, regions: candidate.regions.length, message: 'Text StructurePlan built into a validated voxel grid.' });
            return {
              ...attachReferenceFeatures(candidate, input.referenceImage?.referenceFeatures),
              notes: [...candidate.notes, 'Built from the validated text-model StructurePlan.', 'Auto-repaired vision response into a validated StructurePlan.'],
            };
          }
          messages.push(toolResult(toolCallId, {
            ok: true,
            buildId: latestBuildId,
            dimensions: { width: grid.width, height: grid.height, length: grid.length },
            blocks: grid.cells.length,
            regions: candidate.regions.map(({ name, role, x, y, z, width, height, length }) => ({ name, role, x, y, z, width, height, length })),
            materials: summarizeGridMaterials(grid.cells),
            interior,
            spatial,
            aesthetic: summarizeAestheticChecks(grid.cells, grid.width, grid.height, grid.length),
            referenceMatch: compareReferenceFrontMask(candidate, grid.cells),
            projections: {
              front: summarizeProjection(grid.cells, grid.width, grid.height, 'front'),
              side: summarizeProjection(grid.cells, grid.length, grid.height, 'side'),
              top: summarizeProjection(grid.cells, grid.width, grid.length, 'top'),
            },
            feedback: `This is the executed voxel result, not a preview estimate. ${referenceSilhouetteFeedback(compareReferenceFrontMask(candidate, grid.cells), candidate.dimensions.height)} Spatial report: ${JSON.stringify(spatial)}. Interior audit: ${interior.occupiedBlocks} occupied blocks in ${interior.volume} room-volume cells; ${interior.lightBlocks} internal lights. Use band Y ranges to edit only the specific roof/body/tassel parts responsible for the camera-facing mismatch. Never delete a complete Y slice or interior based only on an empty 2D silhouette band. Do not mechanically copy facade pixels. Inspect the result and rebuild if needed.`,
          }));
          const buildMatch = compareReferenceFrontMask(candidate, grid.cells);
          options.onToolEvent?.({ stage: 'tool_result', turn, tool: toolName, ok: true, blocks: grid.cells.length, regions: candidate.regions.length, silhouette: buildMatch?.silhouette, interiorBlocks: interior.occupiedBlocks, interiorLights: interior.lightBlocks, message: `${buildMatch ? `${buildMatch.face}: missing ${Math.round(buildMatch.missing * 100)}%, extra ${Math.round(buildMatch.extra * 100)}%. ` : ''}${interior.occupiedBlocks} actual blocks in ${interior.volume} interior volume cells; ${interior.lightBlocks} interior lights.` });
        } catch (error) {
          const failureMessage = error instanceof Error ? error.message : 'The proposed structure could not be built.';
          identicalBuildFailures = failureMessage === lastBuildFailure ? identicalBuildFailures + 1 : 1;
          lastBuildFailure = failureMessage;
          const correction = describeConstructionFailure(failureMessage, args.plan);
          options.onToolEvent?.({ stage: 'tool_result', turn, tool: toolName, ok: false, message: `${failureMessage} ${correction}` });
          messages.push(toolResult(toolCallId, {
            ok: false,
            error: failureMessage,
            feedback: `${correction} Keep the original image as the source of truth. Correct the specific coordinates or dimensions and rebuild; do not repeat unchanged geometry.`,
          }));
          if (identicalBuildFailures >= MAX_IDENTICAL_BUILD_FAILURES) {
            throw Object.assign(new Error(`The construction tool rejected the same plan ${identicalBuildFailures} times. Last validation error: ${failureMessage}`), { statusCode: 422, code: 'BUILD_VALIDATION_REPEATED' });
          }
        }
        continue;
      }

      if (toolName === 'analyze_reference_image') {
        if (!imageUrl) {
          messages.push(toolResult(toolCallId, { ok: false, error: 'Image analysis is only available for requests with an original reference image.' }));
          continue;
        }
        const invalidAnalysis = validateReferenceImageAnalysis(args);
        if (invalidAnalysis) {
          messages.push(toolResult(toolCallId, { ok: false, error: invalidAnalysis, instruction: 'Look at the attached original image and return a concrete object/building identification and its visible visual facts.' }));
          options.onToolEvent?.({ stage: 'tool_result', turn, tool: toolName, ok: false, message: invalidAnalysis });
          continue;
        }
        referenceAnalysis = args as ReferenceImageAnalysis;
        const colorBrief = referenceColorInstruction(input.referenceImage?.referenceFeatures);
        const summary = describeReferenceAnalysis(referenceAnalysis);
        messages.push(toolResult(toolCallId, {
          ok: true,
          analysis: referenceAnalysis,
          measuredImageColors: colorBrief,
          next: 'Keep the original image as primary evidence. Build this identified subject and account for each visible part, its silhouette, symmetry, camera view, and depth cues using real Minecraft blocks.',
        }));
        options.onToolEvent?.({ stage: 'tool_result', turn, tool: toolName, ok: true, message: `Identified ${referenceAnalysis.object} (${referenceAnalysis.category}); ${referenceAnalysis.visibleParts.length} visible components, ${referenceAnalysis.symmetry} symmetry, ${referenceAnalysis.view} view. ${summary}` });
        continue;
      }

      if (toolName === 'get_minecraft_blocks') {
        catalogProvided = true;
        const category = String(args.category ?? 'all');
        const catalog = category === 'all'
          ? BUILDING_BLOCK_CATALOG
          : Object.fromEntries(Object.entries(BUILDING_BLOCK_CATALOG).filter(([name]) => name === category));
        messages.push(toolResult(toolCallId, { namespace: 'minecraft', category, blocks: catalog }));
        options.onToolEvent?.({ stage: 'tool_result', turn, tool: toolName, ok: true, message: `${Object.values(catalog).flat().length} vanilla block IDs available.` });
        continue;
      }

      if (toolName === 'inspect_voxel_structure') {
        const buildId = String(args.buildId ?? '');
        const build = builds.get(buildId);
        if (!build || buildId !== latestBuildId) {
          messages.push(toolResult(toolCallId, { ok: false, error: 'Inspect the most recent successful buildId.' }));
          continue;
        }
        inspectedBuilds.add(buildId);
        const match = compareReferenceFrontMask(build.plan, build.grid.cells);
        if (imageUrl && match) {
          const score = referenceMatchScore(match);
          stagnantReferenceInspections = score > bestReferenceScore + MIN_REFERENCE_PROGRESS ? 0 : stagnantReferenceInspections + 1;
          bestReferenceScore = Math.max(bestReferenceScore, score);
        }
        const interior = summarizeInteriorVoxelization(build.plan, build.grid.cells, `${input.prompt} ${build.plan.type} ${build.plan.name}`);
        options.onToolEvent?.({ stage: 'tool_result', turn, tool: toolName, ok: true, blocks: build.grid.cells.length, regions: build.plan.regions.length, silhouette: match?.silhouette, interiorBlocks: interior.occupiedBlocks, interiorLights: interior.lightBlocks, message: `${match ? `Reference silhouette ${Math.round(match.silhouette * 100)}% on ${match.face}; missing ${Math.round(match.missing * 100)}%, extra ${Math.round(match.extra * 100)}%. ` : ''}${interior.occupiedBlocks} actual blocks in ${interior.volume} interior volume cells; ${interior.lightBlocks} interior lights.` });
        messages.push(toolResult(toolCallId, {
          ok: true,
          buildId,
          dimensions: build.plan.dimensions,
          blocks: build.grid.cells.length,
          regionCount: build.plan.regions.length,
          materials: summarizeGridMaterials(build.grid.cells),
          interior,
          spatial: summarizeSpatialStructure(build.grid.cells, build.grid.width, build.grid.height, build.grid.length),
          aesthetic: summarizeAestheticChecks(build.grid.cells, build.grid.width, build.grid.height, build.grid.length),
          referenceMatch: match,
          projections: {
            front: summarizeProjection(build.grid.cells, build.grid.width, build.grid.height, 'front'),
            side: summarizeProjection(build.grid.cells, build.grid.length, build.grid.height, 'side'),
            top: summarizeProjection(build.grid.cells, build.grid.width, build.grid.length, 'top'),
          },
          feedback: `Inspection complete. ${referenceSilhouetteFeedback(match, build.plan.dimensions.height)} Spatial report: ${JSON.stringify(summarizeSpatialStructure(build.grid.cells, build.grid.width, build.grid.height, build.grid.length))}. Use the target Y ranges and explicit add/remove/resize/shift actions on the named camera-facing parts only; never remove a complete Y slice from an empty projection band. Inspect coherent side, rear, top, underside, structure and interior through voxel projections and rebuild until the reference gates pass.`,
        }));
        if (imageUrl && options.renderPreview) {
          const preview = await options.renderPreview(build.grid, build.plan);
          visualFeedback.push({ role: 'user', content: [
            { type: 'text', text: `Executed voxel build ${buildId}. Four orthographic block-color views: top-left declared reference face, top-right rear, bottom-left side, bottom-right top. Colors are representative block colors, without textures or lighting. Compare this actual geometry with the ORIGINAL image still attached. Report identity, component, proportion, and material mismatches through review_reference_structure. Rebuild if it does not resemble the subject. A silhouette score alone is insufficient.` },
            { type: 'image_url', image_url: { url: preview } },
          ] });
        }
        if (imageUrl && match && !passesReferenceMatch(match) && stagnantReferenceInspections >= MAX_STAGNANT_REFERENCE_INSPECTIONS) {
          throw Object.assign(new Error(`Reference construction stopped early after ${stagnantReferenceInspections} inspected builds without meaningful improvement. ${referenceSilhouetteFeedback(match, build.plan.dimensions.height)} The model repeatedly failed to change the measured silhouette; no result was finalized.`), { statusCode: 422, code: 'REFERENCE_MATCH_STAGNANT' });
        }
        continue;
      }

      if (toolName === 'review_reference_structure') {
        const buildId = String(args.buildId ?? '');
        if (!imageUrl || buildId !== latestBuildId || !inspectionsSeenByModel.has(buildId)) {
          messages.push(toolResult(toolCallId, { ok: false, error: 'Review the latest build only after receiving its inspection in a previous turn.' }));
          continue;
        }
        if (typeof args.matchesReference !== 'boolean' || !Array.isArray(args.mismatches) || args.mismatches.some((item: unknown) => typeof item !== 'string') || typeof args.summary !== 'string' || !args.summary.trim()) {
          messages.push(toolResult(toolCallId, { ok: false, error: 'Report matchesReference, a string array of mismatches, and a concrete visual comparison summary.' }));
          continue;
        }
        const accepted = args.matchesReference && args.mismatches.length === 0;
        if (accepted) reviewedBuilds.add(buildId);
        messages.push(toolResult(toolCallId, { ok: accepted, buildId, summary: args.summary, mismatches: args.mismatches, next: accepted ? 'Visual review passed; finish the structure.' : 'Rebuild the mismatched geometry/materials while preserving the original subject.' }));
        options.onToolEvent?.({ stage: 'tool_result', turn, tool: toolName, ok: accepted, message: `${args.summary}${args.mismatches.length ? ` Corrections: ${args.mismatches.join('; ')}` : ''}` });
        if (!accepted) rejectedReviews.add(buildId);
        continue;
      }

      if (toolName === 'finish_structure') {
        const buildId = String(args.buildId ?? '');
        const completed = builds.get(buildId);
        if (!completed || buildId !== latestBuildId || !inspectionsSeenByModel.has(buildId) || (imageUrl && !reviewedBuilds.has(buildId))) {
          messages.push(toolResult(toolCallId, { ok: false, error: 'buildId must identify the latest successful build and its inspection report must have been returned in a previous turn.' }));
          continue;
        }
        const referenceMatch = compareReferenceFrontMask(completed.plan, completed.grid.cells);
        if (imageUrl && referenceMatch && !passesReferenceMatch(referenceMatch)) {
          messages.push(toolResult(toolCallId, { ok: false, error: `${referenceSilhouetteFeedback(referenceMatch, completed.plan.dimensions.height)} Required gates: silhouette >= ${Math.round(MIN_REFERENCE_SILHOUETTE_MATCH * 100)}%, missing <= ${Math.round(MAX_REFERENCE_MISSING * 100)}%, extra <= ${Math.round(MAX_REFERENCE_EXTRA * 100)}%. Revise this face and rebuild before finishing.` }));
          continue;
        }
        return {
          ...attachReferenceFeatures(completed.plan, input.referenceImage?.referenceFeatures),
          notes: [...completed.plan.notes, imageUrl
            ? `Built and checked by the unified model using the original reference image in ${turn} tool turns.`
            : `Built and checked by the configured building model in ${turn} tool turns.`],
        };
      }

      messages.push(toolResult(toolCallId, { ok: false, error: `Unknown construction tool: ${String(toolName)}` }));
    }
    messages.push(...visualFeedback);
  }

  const completed = builds.get(latestBuildId);
  if (completed) {
    const referenceMatch = compareReferenceFrontMask(completed.plan, completed.grid.cells);
    if (imageUrl && (!inspectedBuilds.has(latestBuildId) || !reviewedBuilds.has(latestBuildId))) {
      throw Object.assign(new Error(`The latest 3D build was not inspected before the ${MAX_BUILD_TOOL_TURNS}-turn limit. No result was finalized.`), { statusCode: 422, code: 'MODEL_BUILD_NOT_INSPECTED' });
    }
    if (!imageUrl || !referenceMatch || passesReferenceMatch(referenceMatch)) {
      return finalizeInspectedBuild(
        completed.plan,
        input,
        imageUrl,
        MAX_BUILD_TOOL_TURNS,
        inspectedBuilds.has(latestBuildId)
          ? 'The server finalized the latest inspected build.'
          : 'The server finalized the latest engine-validated build after the model turn budget expired.',
      );
    }
    throw Object.assign(new Error(`The full reference match gates remained unmet after ${MAX_BUILD_TOOL_TURNS} construction turns. ${referenceSilhouetteFeedback(referenceMatch, completed.plan.dimensions.height)} No result was finalized.`), { statusCode: 422, code: 'REFERENCE_MATCH_TOO_LOW' });
  }

  throw Object.assign(new Error(`The model used ${MAX_BUILD_TOOL_TURNS} construction turns without producing a buildable voxel structure. Its last required tool was '${requiredToolForLatestState(catalogProvided, latestBuildId, inspectedBuilds)}'. Retry once; if this repeats, the provider is not following required tool calls.`), { statusCode: 422, code: 'MODEL_TOOL_LOOP_EXHAUSTED' });
}

function requiredToolForLatestState(catalogProvided: boolean, latestBuildId: string, inspectedBuilds: Set<string>): string {
  if (!catalogProvided) return 'get_minecraft_blocks';
  if (!latestBuildId) return 'build_voxel_structure';
  if (!inspectedBuilds.has(latestBuildId)) return 'inspect_voxel_structure';
  return 'build_voxel_structure or finish_structure';
}

function finalizeInspectedBuild(plan: StructurePlan, input: BuildingPrompt, imageUrl: string | undefined, turn: number, completionNote = 'The server finalized the inspected build.'): StructurePlan {
  return {
    ...attachReferenceFeatures(plan, input.referenceImage?.referenceFeatures),
    notes: [...plan.notes, imageUrl
      ? `Built and checked by the unified model using the original reference image in ${turn} tool turns. ${completionNote}`
      : `Built and checked by the configured building model in ${turn} tool turns. ${completionNote}`],
  };
}

function prepareModelPlan(value: unknown, imageUrl: string | undefined, constraints?: BuildingPrompt['constraints'], referenceFeatures?: ReferenceFeatures, promptHint = ''): StructurePlan {
  const parsed = value && typeof value === 'object' ? value as StructurePlan : parseVisionResponse(JSON.stringify(value));
  if (!imageUrl) return validateStructurePlan(applyHardConstraints(parsed, constraints));
  const normalized = normalizeReferenceRegions(attachReferenceFeatures(parsed, referenceFeatures));
  assertRequestedDimensions(normalized, constraints);
  if (!['x-min', 'x-max', 'z-min', 'z-max'].includes(String(parsed.referenceFacing))) throw new Error('Reference plan must declare referenceFacing as x-min, x-max, z-min or z-max.');
  if (!parsed.geometry?.parts.length) throw new Error('Reference-image construction requires model-authored 3D geometry.parts; region labels or a facade-only plan are not enough.');
  return validateStructurePlan(normalized);
}

function addRequestedInterior(plan: StructurePlan, constraints?: BuildingPrompt['constraints'], identityHint = `${plan.type} ${plan.name}`): StructurePlan {
  if (constraints?.includeInterior === false || (constraints?.detailLevel ?? 0) < 4) return plan;
  if (plan.inference?.category && plan.inference.category !== 'building' && !/lantern|lamp|chandelier|灯笼|吊灯|灯具/i.test(identityHint)) return plan;
  const parts = synthesizeInteriorGeometry(plan.geometry?.parts ?? [], plan.regions, plan.rooms ?? [], plan.palette, constraints, identityHint);
  return { ...plan, geometry: { parts } };
}

function summarizeGridMaterials(cells: Array<{ block: { id: string } }>): Array<{ block: string; count: number }> {
  const counts = new Map<string, number>();
  for (const cell of cells) counts.set(cell.block.id, (counts.get(cell.block.id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 16)
    .map(([block, count]) => ({ block, count }));
}

function summarizeAestheticChecks(cells: Array<{ x: number; y: number; z: number }>, width: number, height: number, length: number) {
  if (!cells.length) return { focalCentrality: 0, negativeSpaceRatio: 1, rhythmScore: 0, detailNoiseRatio: 1, unsupportedRisk: 1 };
  const occupied = new Set(cells.map((cell) => `${cell.x},${cell.y},${cell.z}`));
  const centerX = (width - 1) / 2;
  const centerZ = (length - 1) / 2;
  const averageDistance = cells.reduce((sum, cell) => sum + Math.hypot(cell.x - centerX, cell.z - centerZ), 0) / cells.length;
  const maximumDistance = Math.max(1, Math.hypot(centerX, centerZ));
  const focalCentrality = clampScore(1 - averageDistance / maximumDistance);
  const envelope = Math.max(1, width * height * length);
  const negativeSpaceRatio = clampScore(1 - cells.length / envelope);
  const rows = new Map<number, number>();
  for (const cell of cells) rows.set(cell.y, (rows.get(cell.y) ?? 0) + 1);
  const rowCounts = [...rows.values()];
  const averageRow = rowCounts.reduce((sum, value) => sum + value, 0) / Math.max(1, rowCounts.length);
  const variance = rowCounts.reduce((sum, value) => sum + Math.abs(value - averageRow), 0) / Math.max(1, rowCounts.length * averageRow);
  const rhythmScore = clampScore(1 - variance);
  let isolated = 0;
  let unsupported = 0;
  for (const cell of cells) {
    const neighbors = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].filter(([dx, dy, dz]) => occupied.has(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`)).length;
    if (neighbors <= 1) isolated += 1;
    if (cell.y > 0 && !occupied.has(`${cell.x},${cell.y - 1},${cell.z}`) && neighbors <= 2) unsupported += 1;
  }
  return {
    focalCentrality: roundScore(focalCentrality),
    negativeSpaceRatio: roundScore(negativeSpaceRatio),
    rhythmScore: roundScore(rhythmScore),
    detailNoiseRatio: roundScore(isolated / cells.length),
    unsupportedRisk: roundScore(unsupported / cells.length),
  };
}

function structurePlanSignature(plan: StructurePlan): string {
  const parts = [...(plan.geometry?.parts ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify({ dimensions: plan.dimensions, referenceFacing: plan.referenceFacing, palette: plan.palette, parts });
}

function summarizeSpatialStructure(cells: Array<{ x: number; y: number; z: number; block: { id: string } }>, width: number, height: number, length: number) {
  if (!cells.length) return { occupiedSize: { width: 0, height: 0, length: 0 }, volumeFill: 0, mirrorMatch: { x: 0, z: 0 } };
  const occupied = new Map(cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.block.id]));
  const bounds = cells.reduce((box, cell) => ({
    minX: Math.min(box.minX, cell.x), minY: Math.min(box.minY, cell.y), minZ: Math.min(box.minZ, cell.z),
    maxX: Math.max(box.maxX, cell.x), maxY: Math.max(box.maxY, cell.y), maxZ: Math.max(box.maxZ, cell.z),
  }), { minX: width, minY: height, minZ: length, maxX: -1, maxY: -1, maxZ: -1 });
  const spanX = bounds.maxX - bounds.minX + 1;
  const spanY = bounds.maxY - bounds.minY + 1;
  const spanZ = bounds.maxZ - bounds.minZ + 1;
  const mirrorMatch = (axis: 'x' | 'z') => {
    let matched = 0;
    for (const cell of cells) {
      const x = axis === 'x' ? bounds.minX + bounds.maxX - cell.x : cell.x;
      const z = axis === 'z' ? bounds.minZ + bounds.maxZ - cell.z : cell.z;
      if (occupied.get(`${x},${cell.y},${z}`) === cell.block.id) matched += 1;
    }
    return roundScore(matched / cells.length);
  };
  return {
    occupiedSize: { width: spanX, height: spanY, length: spanZ },
    volumeFill: roundScore(cells.length / Math.max(1, spanX * spanY * spanZ)),
    mirrorMatch: { x: mirrorMatch('x'), z: mirrorMatch('z') },
  };
}

function clampScore(value: number): number { return Math.max(0, Math.min(1, value)); }
function roundScore(value: number): number { return Math.round(clampScore(value) * 100) / 100; }

function summarizeProjection(
  cells: Array<{ x: number; y: number; z: number }>,
  width: number,
  height: number,
  view: 'front' | 'side' | 'top',
): string[] {
  const horizontalSize = Math.min(48, width);
  const verticalSize = Math.min(48, height);
  const columns = horizontalSize;
  const rows = verticalSize;
  const occupied = new Uint8Array(columns * rows);
  for (const cell of cells) {
    const horizontal = view === 'side' ? cell.z : cell.x;
    const vertical = view === 'top' ? cell.z : cell.y;
    const x = Math.min(columns - 1, Math.floor(horizontal * columns / width));
    const y = rows - 1 - Math.min(rows - 1, Math.floor(vertical * rows / height));
    occupied[y * columns + x] = 1;
  }
  return Array.from({ length: rows }, (_, y) => {
    let row = '';
    for (let x = 0; x < columns; x += 1) row += occupied[y * columns + x] ? '#' : '.';
    return row;
  });
}

function toolResult(toolCallId: string, value: unknown) {
  return { role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(value) };
}

function describeConstructionFailure(message: string, plan: any): string {
  const dimensions = plan?.dimensions ?? {};
  if (/outside the StructurePlan dimensions|outside.*dimension/i.test(message)) {
    return `The plan has dimensions ${dimensions.width ?? '?'} x ${dimensions.height ?? '?'} x ${dimensions.length ?? '?'}. One or more region, room or geometry-part bounds extend beyond it. Keep every origin non-negative and enforce x+width<=${dimensions.width ?? 'width'}, y+height<=${dimensions.height ?? 'height'}, z+length<=${dimensions.length ?? 'length'}; move or shrink the offending part (for example side_paper) before rebuilding.`;
  }
  if (/3D geometry\.parts|facade-like/i.test(message)) return 'The plan does not contain an executable 3D volume. Add model-authored geometry.parts for the base, complete body depth, roof and major details; region labels alone do not place blocks.';
  if (/too large|block limit/i.test(message)) return 'Reduce dimensions or simplify repeated details while preserving the reference silhouette and proportions.';
  return `Construction validation failed: ${message}`;
}

function silhouetteSpanProfile(rows: string[], bandCount = 16): string[] {
  if (!rows.length) return [];
  return Array.from({ length: bandCount }, (_, band) => {
    const start = Math.floor(band * rows.length / bandCount);
    const end = Math.max(start + 1, Math.floor((band + 1) * rows.length / bandCount));
    const occupiedColumns = new Set<number>();
    for (const row of rows.slice(start, end)) for (let x = 0; x < row.length; x += 1) if (row[x] === '#') occupiedColumns.add(x);
    if (!occupiedColumns.size) return `${String(band).padStart(2, '0')}:empty`;
    const min = Math.min(...occupiedColumns);
    const max = Math.max(...occupiedColumns);
    const normalizedMin = Math.round(min * 15 / Math.max(1, rows[0].length - 1));
    const normalizedMax = Math.round(max * 15 / Math.max(1, rows[0].length - 1));
    return `${String(band).padStart(2, '0')}:${normalizedMin}-${normalizedMax}`;
  });
}

function referenceOutlineInstruction(features?: ReferenceFeatures): string {
  if (!features?.frontMask?.length || !features.maskWidth || !features.maskHeight) return '';
  const left = Math.max(0, Math.floor(features.subjectBounds.left * features.maskWidth));
  const right = Math.min(features.maskWidth, Math.ceil(features.subjectBounds.right * features.maskWidth));
  const top = Math.max(0, Math.floor(features.subjectBounds.top * features.maskHeight));
  const bottom = Math.min(features.maskHeight, Math.ceil(features.subjectBounds.bottom * features.maskHeight));
  const rows = Array.from({ length: bottom - top }, (_, y) => {
    let row = '';
    for (let x = left; x < right; x += 1) row += features.frontMask[(top + y) * features.maskWidth + x] ? '#' : '.';
    return row;
  });
  return `Measured front-silhouette span profile, top-to-bottom across 16 equal height bands; x bins are 0-15: ${silhouetteSpanProfile(rows).join(', ')}. This is geometry evidence, not a block map. Use the bands to keep the crown narrow, body width proportional, and base/tassels within the reference outline; explain any deliberate perspective/depth overhang in your design.`;
}

function referenceColorInstruction(features?: ReferenceFeatures): string {
  if (!features?.frontMask?.length || !features.colorMask?.length || !features.colorPalette?.length) return '';
  const counts = new Map<number, number>();
  let foregroundPixels = 0;
  for (let index = 0; index < features.frontMask.length; index += 1) {
    if (!features.frontMask[index]) continue;
    const paletteIndex = features.colorMask[index];
    if (!Number.isInteger(paletteIndex) || !features.colorPalette[paletteIndex]) continue;
    counts.set(paletteIndex, (counts.get(paletteIndex) ?? 0) + 1);
    foregroundPixels += 1;
  }
  if (!foregroundPixels) return '';
  const measured = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([index, count]) => {
      const color = features.colorPalette[index];
      const hex = `#${[color.r, color.g, color.b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
      return `${hex} (${referenceColorName(color)}, ${Math.round(count * 100 / foregroundPixels)}%)`;
    });
  return `Measured original-image foreground colors (largest areas first): ${measured.join(', ')}. Preserve this area hierarchy with real vanilla Minecraft blocks: dominant colors must cover the main mass, and small accents must remain small.`;
}

function referenceColorName(color: { r: number; g: number; b: number }): string {
  const { r, g, b } = color;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  if (maximum < 38) return 'near-black';
  const family = colorFamilyFromRgb(color);
  if (family === 'neutral') return maximum > 215 ? 'white' : maximum > 145 ? 'light gray' : 'gray';
  return family;
}

type ColorFamily = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'pink' | 'brown' | 'neutral';

export function referenceMaterialColorFeedback(features: ReferenceFeatures | undefined, cells: ReadonlyArray<{ block: { id: string } }>): string | undefined {
  if (!features?.frontMask?.length || !features.colorMask?.length || !features.colorPalette?.length || !cells.length) return undefined;
  const referenceCounts = new Map<ColorFamily, number>();
  let referencePixels = 0;
  for (let index = 0; index < features.frontMask.length; index += 1) {
    if (!features.frontMask[index]) continue;
    const color = features.colorPalette[features.colorMask[index]];
    if (!color) continue;
    const family = colorFamilyFromRgb(color);
    referenceCounts.set(family, (referenceCounts.get(family) ?? 0) + 1);
    referencePixels += 1;
  }
  const generatedCounts = new Map<ColorFamily, number>();
  let generatedBlocks = 0;
  for (const cell of cells) {
    const family = colorFamilyFromBlock(cell.block.id);
    if (!family) continue;
    generatedCounts.set(family, (generatedCounts.get(family) ?? 0) + 1);
    generatedBlocks += 1;
  }
  if (!referencePixels || !generatedBlocks) return undefined;
  const missing = [...referenceCounts.entries()]
    .filter(([family, count]) => family !== 'neutral' && count / referencePixels >= 0.18)
    .map(([family, count]) => ({ family, target: count / referencePixels, generated: (generatedCounts.get(family) ?? 0) / generatedBlocks }))
    .filter(({ target, generated }) => generated < Math.max(0.08, target * 0.3));
  if (!missing.length) return undefined;
  return `Reference color mismatch: ${missing.map(({ family, target, generated }) => `${family} covers ${Math.round(target * 100)}% of the image subject but only ${Math.round(generated * 100)}% of placed blocks`).join('; ')}. Recolor the named visible geometry with the closest available vanilla color blocks; preserve its silhouette and do not substitute a dark neutral palette.`;
}

function colorFamilyFromRgb(color: { r: number; g: number; b: number }): ColorFamily {
  const red = color.r / 255;
  const green = color.g / 255;
  const blue = color.b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta < 0.09 || maximum < 0.12) return 'neutral';
  let hue = maximum === red
    ? 60 * (((green - blue) / delta) % 6)
    : maximum === green
      ? 60 * ((blue - red) / delta + 2)
      : 60 * ((red - green) / delta + 4);
  if (hue < 0) hue += 360;
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 155) return 'green';
  if (hue < 195) return 'cyan';
  if (hue < 255) return 'blue';
  if (hue < 285) return 'purple';
  return 'pink';
}

function colorFamilyFromBlock(id: string): ColorFamily | undefined {
  const block = id.replace(/^minecraft:/, '');
  if (/red|crimson|nether_wart/.test(block)) return 'red';
  if (/orange|copper|acacia/.test(block)) return 'orange';
  if (/yellow|gold|bamboo|sand|hay|ochre|birch/.test(block)) return 'yellow';
  if (/lime|green|mossy|azalea|warped/.test(block)) return 'green';
  if (/cyan|prismarine|sea_lantern/.test(block)) return 'cyan';
  if (/light_blue|blue|lapis/.test(block)) return 'blue';
  if (/purple|magenta|amethyst/.test(block)) return 'purple';
  if (/pink|cherry/.test(block)) return 'pink';
  if (/brown|oak|spruce|jungle|dark_oak|mangrove|terracotta|bricks/.test(block)) return 'brown';
  if (/white|quartz|snow|iron/.test(block)) return 'neutral';
  if (/black|deepslate|stone|gray|grey|tuff|andesite|basalt|bedrock/.test(block)) return 'neutral';
  return undefined;
}

function validateReferenceImageAnalysis(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return 'Image analysis must be a structured object.';
  const analysis = value as Partial<ReferenceImageAnalysis>;
  const categories = ['building', 'object', 'vehicle', 'creature', 'landscape', 'other'];
  const symmetries = ['bilateral', 'rotational', 'asymmetric', 'unclear'];
  const views = ['front', 'three-quarter', 'side', 'top', 'isometric', 'unclear'];
  const hasText = (text: unknown, maxLength: number) => typeof text === 'string' && text.trim().length > 1 && text.length <= maxLength;
  if (!hasText(analysis.object, 120) || !categories.includes(String(analysis.category))) return 'Name the pictured subject and choose its correct category; do not infer a generic building when the image shows an object.';
  if (!hasText(analysis.silhouette, 500)) return 'Describe the subject silhouette, main mass, and distinctive outline.';
  if (!Array.isArray(analysis.visibleParts) || analysis.visibleParts.length < 2 || analysis.visibleParts.length > 12 || analysis.visibleParts.some((part) => !hasText(part, 80))) return 'List 2 to 12 specific visible components from the original image.';
  if (!symmetries.includes(String(analysis.symmetry))) return 'Choose the visible symmetry class from bilateral, rotational, asymmetric, or unclear.';
  if (!views.includes(String(analysis.view))) return 'Identify the camera view from front, three-quarter, side, top, isometric, or unclear.';
  if (!Array.isArray(analysis.depthCues) || analysis.depthCues.length < 1 || analysis.depthCues.length > 8 || analysis.depthCues.some((cue) => !hasText(cue, 120))) return 'List at least one visible depth cue or state how hidden depth should be inferred.';
  return undefined;
}

function describeReferenceAnalysis(analysis: ReferenceImageAnalysis): string {
  return `Subject ${analysis.object}; silhouette ${analysis.silhouette}; parts ${analysis.visibleParts.join(', ')}; view ${analysis.view}; symmetry ${analysis.symmetry}; depth cues ${analysis.depthCues.join(', ')}.`;
}

function applyReferenceImageAnalysis(plan: StructurePlan, analysis: ReferenceImageAnalysis): void {
  const description = describeReferenceAnalysis(analysis);
  plan.notes = [...plan.notes, `Model visual analysis: ${description}`];
  plan.inference = {
    ...plan.inference,
    source: 'vision-model',
    detectedType: analysis.object,
    category: analysis.category,
    confidence: Math.max(plan.inference?.confidence ?? 0, 0.72),
    reasoning: description,
  };
}

export function referenceSilhouetteFeedback(match: ReturnType<typeof compareReferenceFrontMask>, modelHeight?: number): string {
  if (!match) return 'No usable reference silhouette measurement was available.';
  const yMin = match.generatedYMin ?? 0;
  const inferredHeight = match.generatedYMax === undefined ? modelHeight : match.generatedYMax - yMin + 1;
  const bands = silhouetteBandMetrics(match.referenceRows, match.generatedRows, 16, inferredHeight, yMin);
  const aspectReport = Number.isFinite(match.referenceAspectRatio) && Number.isFinite(match.generatedAspectRatio)
    ? `Camera-facing width/height ratio: reference ${match.referenceAspectRatio!.toFixed(2)}, build ${match.generatedAspectRatio!.toFixed(2)}. Preserve this proportion; do not stretch width and height independently.`
    : '';
  const profile = bands.map((band) => {
    if (band.targetEmpty && band.buildEmpty) return `${String(band.index).padStart(2, '0')} Y${band.yStart}-${band.yEnd}:REF EMPTY/BUILD EMPTY`;
    if (band.targetEmpty) return `${String(band.index).padStart(2, '0')} Y${band.yStart}-${band.yEnd}:REF EMPTY/BUILD ${band.buildCenter}+/-${band.buildHalf}; CHECK camera-facing overhang and trim only unsupported silhouette pixels; preserve interior/depth`;
    if (band.buildEmpty) return `${String(band.index).padStart(2, '0')} Y${band.yStart}-${band.yEnd}:REF ${band.targetCenter}+/-${band.targetHalf}/BUILD EMPTY; ADD voxels centered near ${band.targetCenter}`;
    const widthAction = band.widthDelta > 0 ? `NARROW by ${band.widthDelta}` : band.widthDelta < 0 ? `WIDEN by ${-band.widthDelta}` : 'KEEP WIDTH';
    const centerAction = band.centerDelta < 0 ? `SHIFT RIGHT by ${-band.centerDelta}` : band.centerDelta > 0 ? `SHIFT LEFT by ${band.centerDelta}` : 'KEEP CENTER';
    return `${String(band.index).padStart(2, '0')} Y${band.yStart}-${band.yEnd}:REF ${band.targetCenter}+/-${band.targetHalf}/BUILD ${band.buildCenter}+/-${band.buildHalf}; ${widthAction}; ${centerAction}`;
  });
  const actionable = bands.filter((band) => !band.targetEmpty && (band.buildEmpty || Math.abs(band.widthDelta) + Math.abs(band.centerDelta) >= 2));
  const largestErrors = actionable.sort((a, b) => Number(b.buildEmpty) - Number(a.buildEmpty) || Math.abs(b.widthDelta) + Math.abs(b.centerDelta) - Math.abs(a.widthDelta) - Math.abs(a.centerDelta)).slice(0, 4).map((band) => `${band.index}(Y${band.yStart}-${band.yEnd})`);
  return `Declared camera-facing projection ${match.face}: silhouette ${Math.round(match.silhouette * 100)}%; missing ${Math.round(match.missing * 100)}%; extra ${Math.round(match.extra * 100)}%. ${aspectReport} Gates: silhouette >= ${Math.round(MIN_REFERENCE_SILHOUETTE_MATCH * 100)}%, missing <= ${Math.round(MAX_REFERENCE_MISSING * 100)}%, extra <= ${Math.round(MAX_REFERENCE_EXTRA * 100)}%. 16 top-to-bottom bands; x center/half-width use bins 0-15. Each band gives the actual Minecraft Y interval within occupied build bounds and a direct action: ${profile.join('; ')}. Fix first: ${largestErrors.join(', ') || 'reinspect orientation and bounds'}. Empty reference bands are projection evidence only: never delete an entire Y slice or interior; adjust only camera-facing geometry that causes measured extra pixels. Empty build bands need their target span added. Edit the named geometry parts that cross those Y intervals and do not reuse unchanged coordinates.`;
}

function silhouetteBandMetrics(referenceRows: string[], generatedRows: string[], bandCount = 16, modelHeight = 16, modelMinY = 0) {
  const occupiedHeight = Math.max(1, Math.floor(modelHeight));
  return Array.from({ length: bandCount }, (_, index) => {
    const target = silhouetteBandBounds(referenceRows, index, bandCount);
    const build = silhouetteBandBounds(generatedRows, index, bandCount);
    const yStart = occupiedHeight < bandCount
      ? modelMinY + occupiedHeight - 1 - Math.floor(index * occupiedHeight / bandCount)
      : modelMinY + Math.floor((bandCount - index - 1) * occupiedHeight / bandCount);
    const yEnd = occupiedHeight < bandCount
      ? yStart
      : modelMinY + Math.floor((bandCount - index) * occupiedHeight / bandCount) - 1;
    const targetWidth = target.empty ? 0 : target.max - target.min + 1;
    const buildWidth = build.empty ? 0 : build.max - build.min + 1;
    return {
      index,
      yStart,
      yEnd,
      targetEmpty: target.empty,
      buildEmpty: build.empty,
      targetCenter: targetWidth ? Math.round((target.min + target.max) / 2) : null,
      targetHalf: Math.ceil(targetWidth / 2),
      buildCenter: buildWidth ? Math.round((build.min + build.max) / 2) : null,
      buildHalf: Math.ceil(buildWidth / 2),
      widthDelta: buildWidth - targetWidth,
      centerDelta: targetWidth && buildWidth ? Math.round((build.min + build.max - target.min - target.max) / 2) : 0,
    };
  });
}

function silhouetteBandBounds(rows: string[], band: number, bandCount: number) {
  const start = Math.floor(band * rows.length / bandCount);
  const end = Math.max(start + 1, Math.floor((band + 1) * rows.length / bandCount));
  let min = rows[0]?.length ?? 0;
  let max = -1;
  for (const row of rows.slice(start, end)) {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== '#') continue;
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  }
  if (max < 0) return { min: 0, max: 0, empty: true };
  const lastBin = Math.max(1, (rows[0]?.length ?? 1) - 1);
  return {
    min: Math.round(min * 15 / lastBin),
    max: Math.round(max * 15 / lastBin),
    empty: false,
  };
}

const MIN_REFERENCE_SILHOUETTE_MATCH = 0.6;
const MAX_REFERENCE_MISSING = 0.18;
const MAX_REFERENCE_EXTRA = 0.2;

function passesReferenceMatch(match: NonNullable<ReturnType<typeof compareReferenceFrontMask>>): boolean {
  return Math.round(match.silhouette * 100) >= Math.round(MIN_REFERENCE_SILHOUETTE_MATCH * 100)
    && Math.round(match.missing * 100) <= Math.round(MAX_REFERENCE_MISSING * 100)
    && Math.round(match.extra * 100) <= Math.round(MAX_REFERENCE_EXTRA * 100);
}

function referenceMatchScore(match: NonNullable<ReturnType<typeof compareReferenceFrontMask>>): number {
  const modelMinY = match.generatedYMin ?? 0;
  const modelHeight = match.generatedYMax === undefined ? 16 : match.generatedYMax - modelMinY + 1;
  const bands = silhouetteBandMetrics(match.referenceRows, match.generatedRows, 16, modelHeight, modelMinY);
  const profileError = bands.reduce((total, band) => total + Math.abs(band.widthDelta) / 16 + Math.abs(band.centerDelta) / 16, 0) / Math.max(1, bands.length);
  return match.silhouette * 0.45 + (1 - Math.min(1, profileError)) * 0.35 - match.missing * 0.1 - match.extra * 0.1;
}

function assertRequestedDimensions(plan: StructurePlan, constraints?: BuildingPrompt['constraints']): void {
  const mismatched = (['width', 'height', 'length'] as const).some((axis) => {
    const requested = constraints?.[axis];
    if (!requested) return false;
    const planned = axis === 'width' ? plan.dimensions.width : axis === 'height' ? plan.dimensions.height : plan.dimensions.length;
    return constraints.sizeMode === 'envelope' ? planned > requested : planned !== requested;
  });
  if (mismatched) throw new Error(constraints?.sizeMode === 'envelope'
    ? 'The visual plan exceeds the selected maximum size. Keep its proportions and fit it within the target envelope.'
    : 'The visual plan does not match the requested target size. Retry without a target size or choose dimensions matching the reference proportions.');
}

function normalizeReferenceRegions(plan: StructurePlan): StructurePlan {
  const { width, height, length } = plan.dimensions;
  if (![width, height, length].every((value) => Number.isInteger(value) && value > 0)) return plan;

  const usedNames = new Set<string>();
  const regions = (Array.isArray(plan.regions) ? plan.regions : []).flatMap((region, index) => {
    const raw = [region?.x, region?.y, region?.z, region?.width, region?.height, region?.length].map(Number);
    if (!raw.every(Number.isFinite) || raw[3] <= 0 || raw[4] <= 0 || raw[5] <= 0) return [];
    const x = Math.max(0, Math.floor(raw[0]));
    const y = Math.max(0, Math.floor(raw[1]));
    const z = Math.max(0, Math.floor(raw[2]));
    const endX = Math.min(width, Math.ceil(raw[0] + raw[3]));
    const endY = Math.min(height, Math.ceil(raw[1] + raw[4]));
    const endZ = Math.min(length, Math.ceil(raw[2] + raw[5]));
    if (x >= endX || y >= endY || z >= endZ) return [];

    const baseName = String(region.name || `Reference region ${index + 1}`).trim();
    let name = baseName;
    for (let suffix = 2; usedNames.has(name); suffix += 1) name = `${baseName} ${suffix}`;
    usedNames.add(name);
    return [{ ...region, name, x, y, z, width: endX - x, height: endY - y, length: endZ - z }];
  });
  if (regions.length) return { ...plan, regions };

  const parts = plan.geometry?.parts ?? [];
  if (!parts.length) return { ...plan, regions: [{ name: 'Reference structure', role: 'reference geometry', x: 0, y: 0, z: 0, width, height, length }] };
  const bounds = parts.reduce((box, part) => ({
    minX: Math.min(box.minX, part.x), minY: Math.min(box.minY, part.y), minZ: Math.min(box.minZ, part.z),
    maxX: Math.max(box.maxX, part.x + part.width), maxY: Math.max(box.maxY, part.y + part.height), maxZ: Math.max(box.maxZ, part.z + part.length),
  }), { minX: width, minY: height, minZ: length, maxX: 0, maxY: 0, maxZ: 0 });
  const x = Math.max(0, bounds.minX); const y = Math.max(0, bounds.minY); const z = Math.max(0, bounds.minZ);
  const endX = Math.min(width, bounds.maxX); const endY = Math.min(height, bounds.maxY); const endZ = Math.min(length, bounds.maxZ);
  if (x >= endX || y >= endY || z >= endZ) return { ...plan, regions: [{ name: 'Reference structure', role: 'reference geometry', x: 0, y: 0, z: 0, width, height, length }] };
  const region: StructureRegionPlan = { name: 'Reference structure', role: 'reference geometry', x, y, z, width: endX - x, height: endY - y, length: endZ - z };
  return { ...plan, regions: [region] };
}

function normalizeChatEndpoint(endpoint: string): string {
  const value = endpoint.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(value)) return value;
  if (/\/v1$/i.test(value)) return `${value}/chat/completions`;
  return value;
}

function buildRequest(input: BuildingPrompt, imageUrl?: string, model?: string, strictSchema = true) {
  const text = input.prompt?.trim() || 'Analyze this reference image and produce a buildable Minecraft structure plan.';
  const outlineInstruction = imageUrl ? referenceOutlineInstruction(input.referenceImage?.referenceFeatures) : '';
  const colorInstruction = imageUrl ? referenceColorInstruction(input.referenceImage?.referenceFeatures) : '';
  const imageInstruction = imageUrl
    ? 'REFERENCE IMAGE MODE IS AUTHORITATIVE. The original image is the source of truth for type, visible silhouette, proportions, perspective, connected masses, roof, openings, facade rhythm, colors and landmarks. You personally conceive the full 3D structure and author its geometry.parts. Declare referenceFacing as exactly one of x-min, x-max, z-min, z-max. The silhouette validator collapses the complete voxel volume into an orthographic projection along that direction, matching what the Viewer FRONT/SIDE projection shows; inset geometry and side-paper bounds cannot hide the main body. Keep orientation stable through revisions. The pixel mask is only a validator; no code will extrude, paint, mirror or synthesize your visible facade. Never replace a distinctive image with a preset, generic tower or rectangular shell. Infer depth from visible cues and choose plausible functional depth when hidden. Decide symmetry from the reference and construct a coherent back, other sides, top, underside, roof interior and hidden rooms using the same design grammar without copying a flat image across faces.'
    : '';
  const planSchema = structurePlanJsonSchema();
  return {
    model: model ?? 'gpt-4o-mini',
    temperature: 0,
    parallel_tool_calls: false,
    tools: [
      ...(imageUrl ? [{
        type: 'function',
        function: {
          name: 'analyze_reference_image',
          description: 'Look at the attached ORIGINAL reference image and identify the pictured item/building itself before construction. Report its specific identity, category, visible parts, silhouette, symmetry, camera view, and visible depth cues. Do not invent a generic building.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['object', 'category', 'silhouette', 'visibleParts', 'symmetry', 'view', 'depthCues'],
            properties: {
              object: { type: 'string', minLength: 2, maxLength: 120 },
              category: { type: 'string', enum: ['building', 'object', 'vehicle', 'creature', 'landscape', 'other'] },
              silhouette: { type: 'string', minLength: 2, maxLength: 500 },
              visibleParts: { type: 'array', minItems: 2, maxItems: 12, items: { type: 'string', minLength: 2, maxLength: 80 } },
              symmetry: { type: 'string', enum: ['bilateral', 'rotational', 'asymmetric', 'unclear'] },
              view: { type: 'string', enum: ['front', 'three-quarter', 'side', 'top', 'isometric', 'unclear'] },
              depthCues: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 2, maxLength: 120 } },
            },
          },
          ...(strictSchema ? { strict: true } : {}),
        },
      }] : []),
      {
        type: 'function',
        function: {
          name: 'get_minecraft_blocks',
          description: 'Read the available vanilla Minecraft building blocks and use these exact namespaced IDs in the construction plan.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['category'],
            properties: { category: { type: 'string', enum: ['all', 'masonry', 'wood', 'roofs', 'openings', 'detail', 'colors'] } },
          },
          ...(strictSchema ? { strict: true } : {}),
        },
      },
      {
        type: 'function',
        function: {
          name: 'build_voxel_structure',
          description: 'Execute the model-authored StructurePlan geometry.parts in the Minecraft voxel builder. For reference images, create a complete volumetric 3D design yourself; a flat facade, empty geometry.parts, or descriptive regions without geometry will be rejected. Apply the Architectural Aesthetic Skill and use real Minecraft materials. The tool reports occupied depth, x/z mirror match, front silhouette, projections, materials, region bounds, and validation errors.',
          parameters: { type: 'object', additionalProperties: false, required: ['plan'], properties: { plan: planSchema } },
          ...(strictSchema ? { strict: true } : {}),
        },
      },
      {
        type: 'function',
        function: {
          name: 'inspect_voxel_structure',
          description: 'Inspect the latest executed voxel build from front, side and top projections, occupied 3D depth, x/z mirror match, dimensions, regions, block count, materials and aesthetic checks. Compare its front silhouette with the original image and judge the full 3D concept against the Architectural Aesthetic Skill before revising or finishing.',
          parameters: { type: 'object', additionalProperties: false, required: ['buildId'], properties: { buildId: { type: 'string' } } },
          ...(strictSchema ? { strict: true } : {}),
        },
      },
      {
        type: 'function',
        function: {
          name: 'review_reference_structure',
          description: 'Compare the executed voxel views against the original reference image after inspection. Accept only when identity, proportions, visible components, material/color hierarchy, and 3D assembly match. Report concrete mismatches and request a rebuild otherwise. A silhouette score alone is insufficient.',
          parameters: { type: 'object', additionalProperties: false, required: ['buildId', 'matchesReference', 'mismatches', 'summary'], properties: { buildId: { type: 'string' }, matchesReference: { type: 'boolean' }, mismatches: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } } },
          ...(strictSchema ? { strict: true } : {}),
        },
      },
      {
        type: 'function',
        function: {
          name: 'finish_structure',
          description: 'Return the latest successfully built StructurePlan as the final result. Call only after build_voxel_structure succeeds and its report is satisfactory.',
          parameters: { type: 'object', additionalProperties: false, required: ['buildId'], properties: { buildId: { type: 'string' } } },
          ...(strictSchema ? { strict: true } : {}),
        },
      },
    ],
    tool_choice: 'auto',
    messages: [
      { role: 'system', content: `${ARCHITECTURAL_AESTHETIC_SKILL} ${createLitematicaPlannerInstruction()} ${imageInstruction} You are an interactive Minecraft construction agent. For reference images, your first action must be analyze_reference_image using the ORIGINAL image; identify the actual subject and visible components, not a generic building. Then call get_minecraft_blocks. Build that same identified subject with model-authored geometry.parts; the original image remains attached and authoritative throughout the conversation. Apply the measured silhouette and color-area evidence without flattening or pixel-extruding the object. Never replace an object with habitable architecture. Inspect the actual voxel grid, front/side/top projections, occupied depth and x/z mirror-match metrics. Compare the front silhouette, proportions, colors and visible landmarks with the original image; compare hidden faces with your own spatial design. Revise mismatches, then rebuild and inspect. Receive an inspection result in a later turn before finish_structure. Use real catalog Minecraft block IDs. Put concise visual identification and spatial assumptions in inference.reasoning, without exposing private chain-of-thought.`.trim() },
      { role: 'user', content: imageUrl ? [
        { type: 'text', text: `${text}\nReconstruct the exact pictured item or building from the original image. Preserve its identity, visible components, overall silhouette, color-area hierarchy, camera view and proportions. Infer plausible hidden depth without changing its identity. Use model-authored geometry.parts; do not substitute a generic object/building, copy the facade onto all sides, or extrude a 2D pixel mask. ${outlineInstruction} ${colorInstruction} Inspect actual projections and revise mismatches before finishing.` },
        { type: 'image_url', image_url: { url: imageUrl } },
      ] : text },
    ],
  };
}

async function requestWithRetry(endpoint: string, headers: Record<string, string>, body: unknown, fetcher: typeof fetch, options: VisionPlannerOptions): Promise<Response> {
  const maxRetries = Math.max(0, Math.min(5, Math.floor(options.maxRetries ?? DEFAULT_RETRIES)));
  const baseDelay = Math.max(0, Math.min(5000, Math.floor(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)));
  const timeoutMs = Math.max(1000, Math.min(300000, Math.floor(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)));
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.signal?.aborted) throw Object.assign(new Error('Model request was cancelled by the client.'), { statusCode: 499, code: 'CLIENT_DISCONNECTED' });
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; timeoutController.abort(); }, timeoutMs);
    const signal = options.signal ? AbortSignal.any([timeoutController.signal, options.signal]) : timeoutController.signal;
    let response: Response;
    try {
      response = await fetcher(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal });
      const content = await readModelBody(response, signal);
      response = new Response(content, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      clearTimeout(timeout);
      if (options.signal?.aborted) throw Object.assign(new Error('Model request was cancelled by the client.'), { statusCode: 499, code: 'CLIENT_DISCONNECTED' });
      const cause = error instanceof Error ? error.cause : undefined;
      const transportError = `${error instanceof Error ? error.message : ''} ${cause instanceof Error ? cause.message : String(cause ?? '')}`;
      const weakCertificate = /EE certificate key too weak|certificate key too weak|ERR_SSL_EE_KEY_TOO_SMALL/i.test(transportError);
      lastError = timedOut
        ? Object.assign(new Error(`Model request timed out after ${timeoutMs}ms. Check the model service and retry.`), { statusCode: 504, code: 'MODEL_TIMEOUT' })
        : weakCertificate
          ? Object.assign(new Error('The model endpoint TLS certificate uses a key that Node rejects as too weak. Update the provider certificate or configure an endpoint with a valid modern TLS certificate.'), { statusCode: 502, code: 'MODEL_TLS_CERTIFICATE_INVALID' })
          : Object.assign(new Error('Could not connect to the model service. Check endpoint connectivity and retry.'), { statusCode: 502, code: 'MODEL_REQUEST_FAILED' });
      if (timedOut || weakCertificate || attempt >= maxRetries) throw lastError;
      options.onToolEvent?.({ stage: 'model_retry', turn: 0, message: `Connection attempt ${attempt + 1} failed; retry ${attempt + 1}/${maxRetries}.` });
      await delay(baseDelay * 2 ** attempt);
      continue;
    }
    clearTimeout(timeout);
    if (response.ok) return response;
    const statusCode = response.status === 429 ? 429 : response.status === 408 ? 504 : response.status >= 400 && response.status < 500 ? response.status : 502;
    const providerMessage = await readProviderError(response);
    const credentialsRejected = response.status === 401 || response.status === 403 || /no valid credentials|invalid (?:api )?key|unauthori[sz]ed|authentication failed/i.test(providerMessage);
    const code = credentialsRejected ? 'MODEL_AUTH_FAILED' : response.status === 429 ? 'RATE_LIMITED' : response.status === 408 ? 'MODEL_TIMEOUT' : statusCode < 500 ? 'MODEL_REQUEST_REJECTED' : 'MODEL_REQUEST_FAILED';
    const fallback = response.status === 429
      ? 'The model service is rate limiting requests. Retry shortly.'
      : response.status === 408
        ? 'The model service timed out. Retry shortly.'
        : credentialsRejected
          ? 'The model provider rejected the configured credentials. Update the API key in Settings and retry.'
        : `The model service returned HTTP ${response.status}. Check its endpoint and model configuration.`;
    lastError = Object.assign(new Error(providerMessage ? `The model service returned HTTP ${response.status}: ${providerMessage}` : fallback), { statusCode, code });
    if (credentialsRejected || !isRetryableStatus(response.status) || attempt >= maxRetries) throw lastError;
    options.onToolEvent?.({ stage: 'model_retry', turn: 0, message: `Provider returned HTTP ${response.status}; retry ${attempt + 1}/${maxRetries}.` });
    await delay(baseDelay * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error('Vision planner request failed.');
}

async function readModelBody(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  const maxBytes = 16 * 1024 * 1024;
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    rejectAbort(signal.reason ?? new DOMException('Model request aborted.', 'AbortError'));
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal.aborted) onAbort();
    while (true) {
      const chunk = await Promise.race([reader.read(), aborted]);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error('Model response exceeds the 16 MB response limit.');
      }
      chunks.push(decoder.decode(chunk.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

async function readProviderError(response: Response): Promise<string> {
  let payload: any;
  try { payload = await response.json(); } catch { return ''; }
  const message = payload?.error?.message ?? payload?.message;
  if (typeof message !== 'string') return '';
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|key|token)-[A-Za-z0-9._-]{12,}\b/gi, '[redacted]')
    .replace(/([?&](?:api[_-]?key|token|key)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 400);
}

function applyHardConstraints(value: StructurePlan, constraints?: BuildingPrompt['constraints']): StructurePlan {
  return repairStructurePlan(value, constraints);
}

function repairStructurePlan(value: any, constraints?: BuildingPrompt['constraints']): StructurePlan {
  const dimensions = value?.dimensions ?? {};
  const width = clampInt(constraints?.width ?? dimensions.width, 1, 512);
  const height = clampInt(constraints?.height ?? dimensions.height, 1, 512);
  const length = clampInt(constraints?.length ?? dimensions.length, 1, 512);
  const regions = Array.isArray(value?.regions) && value.regions.length ? value.regions : [{ name: 'main', role: 'main structure', x: 0, y: 0, z: 0, width, height, length }];
  const normalizedRegions = regions.map((region: any, index: number) => { const x = clampInt(region?.x, 0, width - 1); const y = clampInt(region?.y, 0, height - 1); const z = clampInt(region?.z, 0, length - 1); return { name: String(region?.name || `region-${index + 1}`), role: String(region?.role || 'structure'), x, y, z, width: clampInt(region?.width, 1, width - x), height: clampInt(region?.height, 1, height - y), length: clampInt(region?.length, 1, length - z) }; });
  const geometry = Array.isArray(value?.geometry?.parts) ? value.geometry.parts.map((part: any, index: number) => {
    const x = clampInt(part?.x, 0, width - 1); const y = clampInt(part?.y, 0, height - 1); const z = clampInt(part?.z, 0, length - 1);
    return {
      id: String(part?.id || `part-${index + 1}`),
      type: ['box', 'shell', 'roof', 'cylinder', 'arch', 'stairs', 'beam', 'surface'].includes(part?.type) ? part.type : 'box',
      x, y, z, width: clampInt(part?.width, 1, width - x), height: clampInt(part?.height, 1, height - y), length: clampInt(part?.length, 1, length - z),
      material: normalizePaletteBlock(part?.material, 'minecraft:stone_bricks'),
      hollow: Boolean(part?.hollow), thickness: clampInt(part?.thickness, 1, 4), facing: ['north', 'south', 'east', 'west'].includes(part?.facing) ? part.facing : null,
      openSides: Array.isArray(part?.openSides) ? part.openSides.filter((side: unknown) => ['north', 'south', 'east', 'west', 'top', 'bottom'].includes(String(side))) : [],
      purpose: ['structure', 'roof', 'room', 'partition', 'circulation', 'furniture', 'lighting', 'opening', 'decoration'].includes(part?.purpose) ? part.purpose : 'structure',
      roofStyle: ['flat', 'gable', 'hip', 'mansard', 'dome', 'pavilion'].includes(part?.roofStyle) ? part.roofStyle : 'hip',
      ridgeAxis: part?.ridgeAxis === 'z' ? 'z' : 'x',

    };
  }) : [];
  const rooms = Array.isArray(value?.rooms) ? value.rooms.map((room: any, index: number) => {
    const x = clampInt(room?.x, 0, width - 1); const y = clampInt(room?.y, 0, height - 1); const z = clampInt(room?.z, 0, length - 1);
    return { id: String(room?.id || `room-${index + 1}`), type: String(room?.type || 'room'), floor: clampInt(room?.floor, 0, 63), x, y, z, width: clampInt(room?.width, 1, width - x), height: clampInt(room?.height, 1, height - y), length: clampInt(room?.length, 1, length - z) };
  }) : [];
  const components = Array.isArray(value?.components) ? value.components.map((component: any, index: number) => ({
    id: String(component?.id || `component-${index + 1}`), type: String(component?.type || 'decoration'),
    x: clampInt(component?.x, 0, width - 1), y: clampInt(component?.y, 0, height - 1), z: clampInt(component?.z, 0, length - 1),
    options: component?.options && typeof component.options === 'object' ? component.options : {},
  })) : [];
  const palette = {
    wall: normalizePaletteBlock(value?.palette?.wall, 'minecraft:stone_bricks'),
    floor: normalizePaletteBlock(value?.palette?.floor, 'minecraft:oak_planks'),
    roof: normalizePaletteBlock(value?.palette?.roof, 'minecraft:dark_oak_planks'),
    window: normalizePaletteBlock(value?.palette?.window, 'minecraft:glass_pane'),
  };
  const interiorGeometry = synthesizeInteriorGeometry(geometry as GeometryPart[], normalizedRegions, rooms, palette, constraints, `${value?.type ?? ''} ${value?.name ?? ''}`);
  return {
    version: 1,
    name: String(value?.name || 'Vision building'),
    type: String(value?.type || 'house'),
    style: String(value?.style || 'fantasy'),
    dimensions: { width, height, length },
    floors: clampInt(constraints?.floors ?? value?.floors, 1, Math.min(64, height)),
    rooms,
    regions: normalizedRegions,
    components,
    palette,
    seed: Number.isFinite(Number(value?.seed)) ? Number(value.seed) : 42,
    notes: Array.isArray(value?.notes) ? value.notes : ['Response was locally repaired before validation.'],
    geometry: { parts: interiorGeometry },
    ...(value?.inference && typeof value.inference === 'object' ? { inference: value.inference } : {}),
    ...( ['x-min', 'x-max', 'z-min', 'z-max'].includes(value?.referenceFacing) ? { referenceFacing: value.referenceFacing } : {}),
  };
}

function synthesizeInteriorGeometry(existing: GeometryPart[], regions: StructureRegionPlan[], rooms: RoomPlan[], palette: Record<string, string>, constraints?: BuildingPrompt['constraints'], identity = ''): GeometryPart[] {
  if (constraints?.includeInterior === false || (constraints?.detailLevel ?? 0) < 4) return existing;
  const parts = [...existing];
  if (/\blantern\b|\blamp\b|chandelier|\u706f\u7b3c|\u540a\u706f|\u706f\u5177/i.test(identity)) {
    const chamber = regions.find((region) => /chamber|interior|lantern body/i.test(`${region.name} ${region.role}`))
      ?? regions.find((region) => !/roof|spire|dome|battlement|apron/i.test(`${region.name} ${region.role}`));
    if (!chamber) return parts;
    const core = {
      x: chamber.x + Math.floor(chamber.width / 2),
      y: chamber.y + Math.floor(chamber.height / 2),
      z: chamber.z + Math.floor(chamber.length / 2),
    };
    const hasSeaLanternCore = parts.some((part) => part.material === 'minecraft:sea_lantern'
      && part.x > chamber.x && part.x < chamber.x + chamber.width - 1
      && part.y > chamber.y && part.y < chamber.y + chamber.height - 1
      && part.z > chamber.z && part.z < chamber.z + chamber.length - 1);
    if (!hasSeaLanternCore) parts.push({ id: 'generated-lantern-light-core', type: 'box', ...core, width: 1, height: 1, length: 1, material: 'minecraft:sea_lantern', purpose: 'lighting' });
    return parts.slice(0, 1024);
  }
  const purposes = new Set(parts.map((part) => part.purpose));
  const usableRegions = regions.filter((region) => !/roof|spire|dome|battlement|apron/i.test(region.name + ' ' + region.role));
  const roomSources = rooms.length ? rooms : usableRegions;
  if (!purposes.has('room')) {
    roomSources.slice(0, 64).forEach((room: any, index) => {
      const source = rooms.length ? room : usableRegions[index % Math.max(1, usableRegions.length)];
      if (!source) return;
      const roomHeight = Math.max(3, Math.min(source.height, 6));
      parts.push({ id: 'generated-room-' + (index + 1), type: 'shell', x: source.x, y: source.y, z: source.z, width: source.width, height: roomHeight, length: source.length, material: palette.wall, hollow: true, thickness: 1, openSides: ['bottom', 'top'], purpose: 'room' });
      parts.push({ id: 'generated-floor-' + (index + 1), type: 'surface', x: source.x, y: source.y, z: source.z, width: source.width, height: 1, length: source.length, material: palette.floor, purpose: 'room' });
    });
  }
  if (!purposes.has('circulation')) {
    const sorted = [...usableRegions].sort((left, right) => left.y - right.y);
    for (let index = 0; index < sorted.length - 1 && index < 32; index += 1) {
      const lower = sorted[index]; const upper = sorted[index + 1];
      if (upper.y <= lower.y) continue;
      parts.push({ id: 'generated-stairs-' + (index + 1), type: 'stairs', x: lower.x + Math.floor(Math.max(0, lower.width - 2) / 2), y: lower.y, z: lower.z + Math.floor(Math.max(0, lower.length - 2) / 2), width: 2, height: Math.min(8, Math.max(1, upper.y - lower.y)), length: Math.min(8, Math.max(1, upper.y - lower.y)), material: palette.floor, facing: 'south', purpose: 'circulation' });
    }
    if (sorted.length === 1) {
      const only = sorted[0];
      parts.push({ id: 'generated-main-stairs', type: 'stairs', x: only.x + Math.floor(Math.max(0, only.width - 2) / 2), y: only.y, z: only.z + Math.floor(Math.max(0, only.length - 2) / 2), width: 2, height: Math.min(8, Math.max(1, Math.floor(only.height / 2))), length: Math.min(8, Math.max(1, Math.floor(only.height / 2))), material: palette.floor, facing: 'south', purpose: 'circulation' });
    }
  }
  const furnitureCount = parts.filter((part) => part.purpose === 'furniture').length;
  if (furnitureCount < 3) {
    const source = rooms[0] ?? usableRegions[0] ?? regions[0];
    if (source) {
      const x = source.x + Math.max(1, Math.floor(source.width / 2)); const y = source.y + 1; const z = source.z + Math.max(1, Math.floor(source.length / 2));
      const roomHeight = Math.max(3, Math.min(source.height, 6));
      const lampY = source.y + Math.max(1, roomHeight - 2);
      parts.push({ id: 'generated-table', type: 'box', x, y, z, width: 2, height: 1, length: 2, material: palette.floor, purpose: 'furniture' }, { id: 'generated-chair', type: 'stairs', x: Math.max(source.x, x - 1), y, z, width: 1, height: 1, length: 1, material: 'minecraft:oak_planks', facing: 'south', purpose: 'furniture' }, { id: 'generated-lamp', type: 'box', x: Math.min(source.x + source.width - 1, x + 2), y: lampY, z, width: 1, height: 1, length: 1, material: 'minecraft:lantern', purpose: 'furniture' });
    }
  }
  return parts.slice(0, 1024);
}
function normalizePaletteBlock(value: unknown, fallback: string): string {
  const candidate = typeof value === 'string' ? value.trim().split('[', 1)[0] : '';
  return /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(candidate) ? candidate : fallback;
}

function parseToolResponse(raw: string): any {
  let envelope: any;
  try { envelope = JSON.parse(raw); } catch { throw new Error('The building model returned invalid JSON for its tool-call response.'); }
  const message = envelope?.choices?.[0]?.message;
  if (!message) throw new Error('The building model returned no construction-tool calls.');
  if (!Array.isArray(message.tool_calls) || !message.tool_calls.length) {
    const content = Array.isArray(message.content)
      ? message.content.map((part: any) => typeof part === 'string' ? part : part?.text ?? '').join('')
      : message.content;
    const candidate = parsePlanContent(content);
    if (candidate) {
      return {
        ...message,
        tool_calls: [{
          id: `compat-build-${Date.now()}`,
          type: 'function',
          function: { name: 'build_voxel_structure', arguments: JSON.stringify({ plan: candidate }) },
        }],
      };
    }
    throw new Error('The building model returned no construction-tool calls. The configured endpoint may not support tool calling.');
  }
  return message;
}

function parsePlanContent(content: unknown): StructurePlan | null {
  if (typeof content !== 'string') return content && typeof content === 'object' ? content as StructurePlan : null;
  const normalized = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const value = JSON.parse(normalized);
    return value?.plan && typeof value.plan === 'object' ? value.plan as StructurePlan : value?.dimensions && value?.regions ? value as StructurePlan : null;
  } catch {
    return null;
  }
}

function parseVisionResponse(raw: string): StructurePlan {
  let envelope: any;
  try { envelope = JSON.parse(raw); } catch { throw new Error('Vision planner returned invalid JSON.'); }
  const message = envelope?.choices?.[0]?.message;
  const toolArguments = message?.tool_calls?.find((call: any) => call?.function?.name === 'generate_structure_plan')?.function?.arguments;
  const content = toolArguments ?? message?.content ?? envelope?.output_text ?? envelope?.plan ?? envelope;
  const text = Array.isArray(content) ? content.map((part) => typeof part === 'string' ? part : part?.text ?? '').join('') : content;
  if (typeof text === 'object' && text) return text as StructurePlan;
  if (typeof text !== 'string') throw new Error('Vision planner response did not contain a StructurePlan.');
  const normalized = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(normalized) as StructurePlan; } catch { throw new Error('Vision planner returned malformed StructurePlan JSON.'); }
}

function isRetryableStatus(status: number) { return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500; }
function delay(ms: number) { return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve(); }
function positiveInt(value: unknown, fallback: number) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function clampInt(value: unknown, min: number, max: number) { const number = Number(value); return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : min; }
