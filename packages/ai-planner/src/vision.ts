import { attachReferenceFeatures, createLitematicaPlannerInstruction, validateStructurePlan, type BuildingPrompt, type GeometryPart, type RoomPlan, type StructurePlan, type StructureRegionPlan } from './index.js';

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
const DEFAULT_REPAIR_ATTEMPTS = 1;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

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
  const response = await requestWithRetry(normalizeChatEndpoint(options.endpoint), headers, request, fetcher, options);
  const initial = parseVisionResponse(await response.text());

  try {
    const constrained = input.constraints ? applyHardConstraints(initial, input.constraints) : initial;
    validateStructurePlan(constrained);
    return { ...attachReferenceFeatures(constrained, input.referenceImage?.referenceFeatures), notes: [...constrained.notes, 'Generated by a configured vision planner endpoint.'] };
  } catch (error) {
    const repaired = repairStructurePlan(initial, input.constraints);
    try {
      validateStructurePlan(repaired);
      return { ...attachReferenceFeatures(repaired, input.referenceImage?.referenceFeatures), notes: [...repaired.notes, `Auto-repaired vision response: ${error instanceof Error ? error.message : 'schema mismatch'}`] };
    } catch {
      if ((options.maxRepairAttempts ?? DEFAULT_REPAIR_ATTEMPTS) < 1) throw error;
      const repairRequest = buildRepairRequest(initial, error, options.model, options.strictSchema !== false);
      const repairedResponse = await requestWithRetry(normalizeChatEndpoint(options.endpoint), headers, repairRequest, fetcher, options);
      const repairedPlan = applyHardConstraints(parseVisionResponse(await repairedResponse.text()), input.constraints);
      validateStructurePlan(repairedPlan);
      return { ...attachReferenceFeatures(repairedPlan, input.referenceImage?.referenceFeatures), notes: [...repairedPlan.notes, 'Repaired by the configured vision planner endpoint.'] };
    }
  }
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
    ? 'REFERENCE IMAGE MODE IS AUTHORITATIVE. Build the StructurePlan directly from the supplied image pixels. Preserve the visible silhouette, relative proportions, occlusions, connected parts, roof or head shape, openings, facade rhythm, material colors, and distinctive landmarks. Do not first summarize the image into a generic building type. Do not replace visible geometry with a preset, stacked floors, or a rectangular shell. Every named Region must correspond to a visible connected part.'
    : '';
  return {
    model: model ?? 'gpt-4o-mini',
    temperature: 0,
    response_format: strictSchema ? { type: 'json_schema', json_schema: { name: 'structure_plan', strict: true, schema: structurePlanJsonSchema() } } : { type: 'json_object' },
    tools: [{ type: 'function', function: { name: 'generate_structure_plan', description: 'Generate the complete Minecraft StructurePlan from the original reference image and prompt. Use the image as the source of truth.', parameters: structurePlanJsonSchema() } }],
    tool_choice: { type: 'function', function: { name: 'generate_structure_plan' } },
    messages: [
      { role: 'system', content: `${createLitematicaPlannerInstruction()} ${imageInstruction} Return a geometry.parts list for every visible architectural part and every requested interior part. At high detail, include geometry.parts with purpose room/partition/circulation and at least three separately positioned furniture parts for enclosed buildings. Preserve room connectivity and stairs between all occupied floors. Keep exterior geometry faithful to the reference; add interior geometry behind it without changing its silhouette. At detail levels 4-5, the requested structure MUST be functionally complete inside, not an empty shell: model room floor and ceiling surfaces, partitions, corridors, connecting stairs, doors, windows, kitchen/bath/service rooms, storage, furniture, beds, tables, chairs, counters, lamps and decorative trim as separate positioned parts. For multi-story buildings provide room clusters on every occupied floor and stair connections. Keep the room plan coherent and reachable. Prefer many precise parts over a few large boxes: shells, roof planes, eaves, arches, columns, beams, stairs, furniture and facade surfaces. Parts must be positioned in xyz and use real Minecraft block IDs in material. The renderer will execute these parts directly.`.trim() },
      { role: 'user', content: imageUrl ? [
        { type: 'text', text: `${text}\nReturn geometry, not a verbal description. The image is the primary source of truth.` },
        { type: 'image_url', image_url: { url: imageUrl } },
      ] : text },
    ],
  };
}

function buildRepairRequest(plan: unknown, error: unknown, model?: string, strictSchema = true) {
  return {
    model: model ?? 'gpt-4o-mini',
    temperature: 0,
    response_format: strictSchema ? { type: 'json_schema', json_schema: { name: 'structure_plan', strict: true, schema: structurePlanJsonSchema() } } : { type: 'json_object' },
    messages: [
      { role: 'system', content: `${createLitematicaPlannerInstruction()} Repair the supplied JSON only. Return a complete valid StructurePlan JSON object. Do not add markdown.` },
      { role: 'user', content: `Invalid StructurePlan: ${JSON.stringify(plan)}\nValidation error: ${error instanceof Error ? error.message : 'schema mismatch'}` },
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
