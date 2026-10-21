import { attachReferenceFeatures, createLitematicaPlannerInstruction, structurePlanToGrid, validateStructurePlan, type BuildingPrompt, type GeometryPart, type RoomPlan, type StructurePlan, type StructureRegionPlan } from './index.js';

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
};

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const MAX_BUILD_TOOL_TURNS = 6;
export const ARCHITECTURAL_AESTHETIC_SKILL = `
ARCHITECTURAL AESTHETIC SKILL
Goal: make a deliberate, beautiful Minecraft structure that reads clearly from far away and rewards close inspection.

1. Read the reference before designing. Identify the primary silhouette, visual center, dominant axis, scale, negative space, major masses, roof or cap, repeated motifs, material families, color hierarchy and distinctive landmarks. Preserve those visible facts.
2. Establish hierarchy. Use one main mass, one focal feature and a small number of supporting accents. Do not give every part equal visual weight. Keep a readable silhouette at thumbnail scale.
3. Control proportion. Use a coherent base, body, transition and crown. Align windows, beams, columns, stairs and trim to a shared module. Avoid accidental tiering, random setbacks, thin floating plates and noisy over-segmentation.
4. Build depth. Use foundation, wall plane, frame, recess, projection, eave and ornament layers. Openings must be real voids or transparent blocks with lintels, sills and structural edges.
5. Use materials intentionally. Select a dominant material, a secondary material, a restrained accent and a light source. Keep palette contrast clear; reserve rare colors for focal details. Match the reference color relationships, not just individual color names.
6. Add detail with rhythm and variation. Repeat motifs with consistent spacing, then vary corners, entrances, roof edges and focal areas. Detail should explain structure, use real Minecraft blocks and never obscure the main form.
7. Complete unseen geometry by inference. Continue visible symmetry, module spacing, roof drainage, beams, supports, material transitions and ornament around hidden faces. Close back, opposite side, top, underside and roof interiors. For buildings, infer coherent reachable rooms, circulation, storage, lighting and service spaces. For objects, infer a complete solid assembly without inventing unrelated rooms or floors.
8. Check construction quality. No unsupported floating masses, disconnected stairs, impossible overhangs, paper-thin shells, exposed hollow cavities, abrupt material changes or empty placeholder boxes. Prefer a simpler coherent form over detail that breaks structure.
9. Before finishing, inspect front, side and top projections, block counts, region bounds and material counts. Revise any mismatch with the reference or the aesthetic rules. A valid JSON plan is not finished until its executed voxel result is visually coherent.
`.trim();
const BUILDING_BLOCK_CATALOG = {
  masonry: ['minecraft:stone_bricks', 'minecraft:cracked_stone_bricks', 'minecraft:mossy_stone_bricks', 'minecraft:bricks', 'minecraft:quartz_bricks', 'minecraft:polished_tuff', 'minecraft:tuff_bricks', 'minecraft:chiseled_stone_bricks', 'minecraft:deepslate_bricks', 'minecraft:polished_blackstone_bricks'],
  wood: ['minecraft:oak_planks', 'minecraft:spruce_planks', 'minecraft:dark_oak_planks', 'minecraft:mangrove_planks', 'minecraft:cherry_planks', 'minecraft:bamboo_planks', 'minecraft:oak_log', 'minecraft:stripped_spruce_log'],
  roofs: ['minecraft:deepslate_tiles', 'minecraft:dark_prismarine', 'minecraft:oxidized_cut_copper', 'minecraft:cut_copper', 'minecraft:dark_oak_stairs', 'minecraft:stone_brick_stairs', 'minecraft:deepslate_tile_stairs', 'minecraft:brick_stairs'],
  openings: ['minecraft:glass_pane', 'minecraft:white_stained_glass_pane', 'minecraft:iron_bars', 'minecraft:oak_door', 'minecraft:spruce_door', 'minecraft:dark_oak_trapdoor', 'minecraft:iron_trapdoor'],
  detail: ['minecraft:lantern', 'minecraft:soul_lantern', 'minecraft:chain', 'minecraft:lightning_rod', 'minecraft:chiseled_bookshelf', 'minecraft:flower_pot', 'minecraft:sea_lantern'],
} as const;

export function structurePlanJsonSchema() {
  return {
    ...STRUCTURE_PLAN_SCHEMA,
    required: [...STRUCTURE_PLAN_SCHEMA.required, 'geometry', 'inference'],
    properties: {
      ...STRUCTURE_PLAN_SCHEMA.properties,
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
  const builds = new Map<string, { plan: StructurePlan; grid: ReturnType<typeof structurePlanToGrid> }>();
  const inspectedBuilds = new Set<string>();
  let catalogProvided = false;
  let latestBuildId = '';

  for (let turn = 1; turn <= MAX_BUILD_TOOL_TURNS; turn += 1) {
    const catalogSeenByModel = catalogProvided;
    const inspectionsSeenByModel = new Set(inspectedBuilds);
    const response = await requestWithRetry(
      normalizeChatEndpoint(options.endpoint),
      headers,
      { ...request, messages },
      fetcher,
      { ...options, signal },
    );
    const rawResponse = await response.text();
    let assistantMessage: any;
    try {
      assistantMessage = parseToolResponse(rawResponse);
    } catch (error) {
      if (!/no construction-tool calls|tool calling/i.test(error instanceof Error ? error.message : '')) throw error;
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
      const fallbackPlan = prepareModelPlan(parseVisionResponse(await fallbackResponse.text()), imageUrl, input.constraints);
      return {
        ...attachReferenceFeatures(fallbackPlan, input.referenceImage?.referenceFeatures),
        notes: [...fallbackPlan.notes, 'The configured endpoint did not support tool calls; used validated single-pass compatibility mode.'],
      };
    }
    const calls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];
    if (!calls.length) throw new Error('The building model returned no construction-tool call.');
    messages.push(assistantMessage);

    for (const call of calls) {
      const toolCallId = String(call.id ?? `tool-${turn}-${messages.length}`);
      const toolName = call.function?.name;
      let args: any;
      try {
        args = JSON.parse(call.function?.arguments ?? '{}');
      } catch {
        messages.push(toolResult(toolCallId, { ok: false, error: 'Tool arguments must be valid JSON.' }));
        continue;
      }

      if (toolName === 'build_voxel_structure') {
        if (!catalogSeenByModel) {
          messages.push(toolResult(toolCallId, { ok: false, error: 'Call get_minecraft_blocks first and use the returned vanilla block IDs when selecting materials.' }));
          continue;
        }
        try {
          const candidate = prepareModelPlan(args.plan, imageUrl, input.constraints);
          const grid = structurePlanToGrid(candidate);
          latestBuildId = `build-${turn}-${builds.size + 1}`;
          builds.set(latestBuildId, { plan: candidate, grid });
          messages.push(toolResult(toolCallId, {
            ok: true,
            buildId: latestBuildId,
            dimensions: { width: grid.width, height: grid.height, length: grid.length },
            blocks: grid.cells.length,
            regions: candidate.regions.map(({ name, role, x, y, z, width, height, length }) => ({ name, role, x, y, z, width, height, length })),
            materials: summarizeGridMaterials(grid.cells),
            aesthetic: summarizeAestheticChecks(grid.cells, grid.width, grid.height, grid.length),
            projections: {
              front: summarizeProjection(grid.cells, grid.width, grid.height, 'front'),
              side: summarizeProjection(grid.cells, grid.length, grid.height, 'side'),
              top: summarizeProjection(grid.cells, grid.width, grid.length, 'top'),
            },
            feedback: 'This is the executed voxel result, not a preview estimate. Projection rows use # for occupied cells and . for empty cells. Compare the visible reference side with the projections, then complete the unseen sides using the same symmetry, rhythm, structural logic, palette and ornament rules. The back, opposite side, top, underside and interior must be closed and coherent even when absent from the image. Call inspect_voxel_structure on this build; if a mismatch remains, revise and build again. Finish only after inspection confirms the latest build.',
          }));
        } catch (error) {
          messages.push(toolResult(toolCallId, {
            ok: false,
            error: error instanceof Error ? error.message : 'The proposed structure could not be built.',
            feedback: 'Correct the plan using the error. Keep the reference image as the source of truth and try build_voxel_structure again.',
          }));
        }
        continue;
      }

      if (toolName === 'get_minecraft_blocks') {
        catalogProvided = true;
        const category = String(args.category ?? 'all');
        const catalog = category === 'all'
          ? BUILDING_BLOCK_CATALOG
          : Object.fromEntries(Object.entries(BUILDING_BLOCK_CATALOG).filter(([name]) => name === category));
        messages.push(toolResult(toolCallId, { namespace: 'minecraft', category, blocks: catalog }));
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
        messages.push(toolResult(toolCallId, {
          ok: true,
          buildId,
          dimensions: build.plan.dimensions,
          blocks: build.grid.cells.length,
          regionCount: build.plan.regions.length,
          materials: summarizeGridMaterials(build.grid.cells),
          aesthetic: summarizeAestheticChecks(build.grid.cells, build.grid.width, build.grid.height, build.grid.length),
          projections: {
            front: summarizeProjection(build.grid.cells, build.grid.width, build.grid.height, 'front'),
            side: summarizeProjection(build.grid.cells, build.grid.length, build.grid.height, 'side'),
            top: summarizeProjection(build.grid.cells, build.grid.width, build.grid.length, 'top'),
          },
          feedback: 'Inspection complete. Use the aesthetic report as a gate. If focalCentrality is low, strengthen one central focal feature; if negativeSpaceRatio is near zero, remove clutter and preserve readable gaps; if rhythmScore is low, align repeated windows, beams and ornaments to a module; if detailNoiseRatio or unsupportedRisk is high, simplify isolated blocks and add supports. Complete unseen faces by inference: mirror repeated facade elements where appropriate, continue roof/eave/wall materials around corners, close the underside, add structurally supported hidden framing, and furnish hidden interior space consistently. Do not invent a new style on unseen faces. If satisfactory, call finish_structure in a later model turn with this buildId.',
        }));
        continue;
      }

      if (toolName === 'finish_structure') {
        const buildId = String(args.buildId ?? '');
        const completed = builds.get(buildId);
        if (!completed || buildId !== latestBuildId || !inspectionsSeenByModel.has(buildId)) {
          messages.push(toolResult(toolCallId, { ok: false, error: 'buildId must identify the latest successful build and its inspection report must have been returned in a previous turn.' }));
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
  }

  throw new Error(`The building model did not finish a validated voxel structure within ${MAX_BUILD_TOOL_TURNS} tool turns. Reduce scope or retry.`);
}

function prepareModelPlan(value: unknown, imageUrl: string | undefined, constraints?: BuildingPrompt['constraints']): StructurePlan {
  const parsed = value && typeof value === 'object' ? value as StructurePlan : parseVisionResponse(JSON.stringify(value));
  const plan = imageUrl ? normalizeReferenceRegions(parsed) : applyHardConstraints(parsed, constraints);
  if (imageUrl) assertRequestedDimensions(plan, constraints);
  return validateStructurePlan(plan);
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

function assertRequestedDimensions(plan: StructurePlan, constraints?: BuildingPrompt['constraints']): void {
  const mismatched = (['width', 'height', 'length'] as const).some((axis) => {
    const requested = constraints?.[axis];
    if (!requested) return false;
    const planned = axis === 'width' ? plan.dimensions.width : axis === 'height' ? plan.dimensions.height : plan.dimensions.length;
    return planned !== requested;
  });
  if (mismatched) throw new Error('The visual plan does not match the requested target size. Retry without a target size or choose dimensions matching the reference proportions.');
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
  const imageInstruction = imageUrl
    ? 'REFERENCE IMAGE MODE IS AUTHORITATIVE. The original image is the source of truth for building type, silhouette, proportions, connected parts, roof shape, openings, facade rhythm, color blocks and landmarks. Text, style, palette, room and detail settings are secondary constraints. Never replace a distinctive image with a preset, generic tower or rectangular shell. Preserve the same visible exterior between tool iterations. For every face the image cannot show, infer a complete continuation from visible symmetry, repeated motifs, structural support, gravity, material transitions and architectural style: finish the back, opposite side, top, underside, roof interior and hidden rooms. Invisible geometry must be consistent with the visible geometry and must never be left as a hollow cutaway, floating facade or arbitrary blank wall.'
    : '';
  const planSchema = structurePlanJsonSchema();
  return {
    model: model ?? 'gpt-4o-mini',
    temperature: 0,
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_minecraft_blocks',
          description: 'Read the available vanilla Minecraft building blocks and use these exact namespaced IDs in the construction plan.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['category'],
            properties: { category: { type: 'string', enum: ['all', 'masonry', 'wood', 'roofs', 'openings', 'detail'] } },
          },
          ...(strictSchema ? { strict: true } : {}),
        },
      },
      {
        type: 'function',
        function: {
          name: 'build_voxel_structure',
          description: 'Execute this StructurePlan in the Minecraft voxel builder. Apply the Architectural Aesthetic Skill: preserve the visible reference, establish hierarchy, control proportion, add layered depth, use real materials and complete unseen geometry coherently. The tool returns actual block count, materials, region bounds, and validation errors.',
          parameters: { type: 'object', additionalProperties: false, required: ['plan'], properties: { plan: planSchema } },
          ...(strictSchema ? { strict: true } : {}),
        },
      },
      {
        type: 'function',
        function: {
          name: 'inspect_voxel_structure',
          description: 'Inspect the latest executed voxel build from front, side and top projections, dimensions, regions, block count, material counts and quantitative aesthetic checks for focal point, negative space, rhythm, detail noise and support risk. Judge it against the Architectural Aesthetic Skill before deciding whether to revise it.',
          parameters: { type: 'object', additionalProperties: false, required: ['buildId'], properties: { buildId: { type: 'string' } } },
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
      { role: 'system', content: `${ARCHITECTURAL_AESTHETIC_SKILL} ${createLitematicaPlannerInstruction()} ${imageInstruction} You are an interactive Minecraft construction agent. First call get_minecraft_blocks. Then call build_voxel_structure to create an actual voxel grid. Call inspect_voxel_structure on the newest successful build and compare front, side and top projections with the original image. Treat focalCentrality, negativeSpaceRatio, rhythmScore, detailNoiseRatio and unsupportedRisk as aesthetic gates: repair the plan when the focal point is weak, the silhouette is cluttered, repeated details lose alignment, isolated blocks create noise, or hidden geometry lacks support. If the silhouette, placement, openings, roof, hidden-side completion, palette, hierarchy or material rhythm are wrong or missing, revise the plan and build again, then inspect again. You must receive the inspection result in a later turn before calling finish_structure. Never claim details exist unless the voxel builder reports them. Use real Minecraft block IDs from the catalog. Preserve the visible reference exactly; complete all unseen faces, roof planes, supports and interior rooms by consistent architectural inference. For buildings, hidden interiors must be reachable and structurally supported. For objects, hidden faces must continue the visible form and decoration without inventing floors or unrelated rooms.`.trim() },
      { role: 'user', content: imageUrl ? [
        { type: 'text', text: `${text}\nUse the original image as the primary source. Build the visible structure, then inspect the voxel-builder report and correct mismatches before finishing.` },
        { type: 'image_url', image_url: { url: imageUrl } },
      ] : text },
    ],
  };
}

async function requestWithRetry(endpoint: string, headers: Record<string, string>, body: unknown, fetcher: typeof fetch, options: VisionPlannerOptions): Promise<Response> {
  const maxRetries = Math.max(0, Math.min(5, Math.floor(options.maxRetries ?? DEFAULT_RETRIES)));
  const baseDelay = Math.max(0, Math.min(5000, Math.floor(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)));
  const timeoutMs = Math.max(1000, Math.min(120000, Math.floor(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)));
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
    } catch {
      clearTimeout(timeout);
      if (options.signal?.aborted) throw Object.assign(new Error('Model request was cancelled by the client.'), { statusCode: 499, code: 'CLIENT_DISCONNECTED' });
      lastError = timedOut
        ? Object.assign(new Error(`Model request timed out after ${timeoutMs}ms. Check the model service and retry.`), { statusCode: 504, code: 'MODEL_TIMEOUT' })
        : Object.assign(new Error('Could not connect to the model service. Check endpoint connectivity and retry.'), { statusCode: 502, code: 'MODEL_REQUEST_FAILED' });
      if (attempt >= maxRetries) throw lastError;
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
    await delay(baseDelay * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error('Vision planner request failed.');
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
  const interiorGeometry = synthesizeInteriorGeometry(geometry as GeometryPart[], normalizedRegions, rooms, palette, constraints);
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
  };
}

function synthesizeInteriorGeometry(existing: GeometryPart[], regions: StructureRegionPlan[], rooms: RoomPlan[], palette: Record<string, string>, constraints?: BuildingPrompt['constraints']): GeometryPart[] {
  if (constraints?.includeInterior === false || (constraints?.detailLevel ?? 0) < 4) return existing;
  const parts = [...existing];
  const purposes = new Set(parts.map((part) => part.purpose));
  const usableRegions = regions.filter((region) => !/roof|spire|dome|battlement|apron/i.test(region.name + ' ' + region.role));
  const roomSources = rooms.length ? rooms : usableRegions;
  if (!purposes.has('room')) {
    roomSources.slice(0, 64).forEach((room: any, index) => {
      const source = rooms.length ? room : usableRegions[index % Math.max(1, usableRegions.length)];
      if (!source) return;
      parts.push({ id: 'generated-room-' + (index + 1), type: 'shell', x: source.x, y: source.y, z: source.z, width: source.width, height: Math.max(3, Math.min(source.height, 6)), length: source.length, material: palette.wall, hollow: true, thickness: 1, openSides: ['bottom', 'top'], purpose: 'room' });
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
    const source = usableRegions[0] ?? regions[0];
    if (source) {
      const x = source.x + Math.max(1, Math.floor(source.width / 2)); const y = source.y + 1; const z = source.z + Math.max(1, Math.floor(source.length / 2));
      parts.push({ id: 'generated-table', type: 'box', x, y, z, width: 2, height: 1, length: 2, material: palette.floor, purpose: 'furniture' }, { id: 'generated-chair', type: 'stairs', x: Math.max(source.x, x - 1), y, z, width: 1, height: 1, length: 1, material: 'minecraft:oak_planks', facing: 'south', purpose: 'furniture' }, { id: 'generated-lamp', type: 'box', x: Math.min(source.x + source.width - 1, x + 2), y: y + 2, z, width: 1, height: 1, length: 1, material: 'minecraft:lantern', purpose: 'furniture' });
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
  try { envelope = JSON.parse(raw); } catch { throw new Error('The building model returned invalid tool-call JSON.'); }
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
