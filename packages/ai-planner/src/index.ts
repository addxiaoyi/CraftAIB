import { createGrid, validateGrid, type BlockGrid } from '../../core/dist/index.js';

const MAX_GENERATED_BLOCKS = 12_000_000;
const MAX_STRUCTURE_DIMENSION = 512;

export type BuildingPrompt = {
  prompt: string;
  seed?: number;
  model?: string;
  constraints?: {
    type?: string;
    style?: string;
    floors?: number;
    width?: number;
    height?: number;
    length?: number;
    sizeMode?: 'exact' | 'envelope';
    detailLevel?: number;
    includeInterior?: boolean;
  };
  referenceImage?: {
    width: number;
    height: number;
    pixels?: Uint8Array | number[];
    sourceName?: string;
    url?: string;
    dataUrl?: string;
    referenceFeatures?: ReferenceFeatures;
  };
};

export type RoomPlan = {
  id: string;
  type: string;
  floor: number;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  length: number;
};

export type ComponentPlan = {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  options: Record<string, unknown>;
};

export type GeometryPart = {
  id: string;
  type: 'box' | 'shell' | 'roof' | 'cylinder' | 'arch' | 'stairs' | 'beam' | 'surface';
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  length: number;
  material: string;
  hollow?: boolean;
  thickness?: number;
  facing?: 'north' | 'south' | 'east' | 'west';
  openSides?: Array<'north' | 'south' | 'east' | 'west' | 'top' | 'bottom'>;
  purpose?: 'structure' | 'roof' | 'room' | 'partition' | 'circulation' | 'furniture' | 'lighting' | 'opening' | 'decoration';
  roofStyle?: 'flat' | 'gable' | 'hip' | 'mansard' | 'dome' | 'pavilion';
  ridgeAxis?: 'x' | 'z';
};

export type StructureRegionPlan = {
  name: string;
  role: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  length: number;
};

export type ReferenceFeatures = {
  sourceWidth: number;
  sourceHeight: number;
  subjectBounds: { left: number; top: number; right: number; bottom: number };
  silhouette: number[];
  towerColumns: number[];
  windowColumns: number[];
  floorBands: number[];
  symmetry: number;
  depthRatio: number;
  maskWidth: number;
  maskHeight: number;
  frontMask: number[];
  roofMask: number[];
  colorMask: number[];
  colorPalette: Array<{ r: number; g: number; b: number }>;
  depthProfile: number[];
  evidence?: string[];
  inferences?: string[];
};

export type ProjectionAudit = {
  view: 'front' | 'side' | 'rear' | 'top' | 'bottom';
  silhouette: number;
  missing: number;
  extra: number;
  depth: number;
  materials: number;
  issues: string[];
};

export type InteriorAudit = {
  occupiedVoxels: number;
  volume: number;
  lights: number;
  connectedComponents: number;
  supports: number;
  openings: number;
};

export type ConstructionReview = {
  accepted: boolean;
  projectionAudits: ProjectionAudit[];
  interiorAudit: InteriorAudit;
  materialAudit: { ok: boolean; issues: string[] };
  inferredHiddenGeometry: string[];
  requiredRevision: string[];
};

export type StructurePlan = {
  version: 1;
  name: string;
  type: string;
  style: string;
  dimensions: { width: number; height: number; length: number };
  floors: number;
  rooms: RoomPlan[];
  regions: StructureRegionPlan[];
  components: ComponentPlan[];
  palette: Record<string, string>;
  seed: number;
  notes: string[];
  geometry?: { parts: GeometryPart[] };
  referenceFacing?: 'x-min' | 'x-max' | 'z-min' | 'z-max';
  inference?: { source: 'prompt' | 'reference-heuristic' | 'vision-model'; detectedType?: string; detectedStyle?: string; confidence?: number; reasoning?: string; category?: 'object' | 'building' | 'vehicle' | 'creature' | 'landscape' | 'other' };
  referenceFeatures?: ReferenceFeatures;
  referenceValidation?: ReferenceMatch | null;
  constructionReview?: ConstructionReview;
};

export type ReferenceMatch = {
  silhouette: number;
  occupied: number;
  missing: number;
  extra: number;
  face: 'z-min' | 'z-max' | 'x-min' | 'x-max';
  generatedYMin?: number;
  generatedYMax?: number;
  referenceAspectRatio?: number;
  generatedAspectRatio?: number;
  referenceRows: string[];
  generatedRows: string[];
};

const BUILDING_TYPES = ['house', 'tower', 'castle', 'dungeon', 'ship', 'cathedral', 'bridge', 'windmill', 'marketplace', 'village', 'city', 'harbor', 'palace', 'industrial'] as const;
const STYLES = ['fantasy', 'medieval', 'modern', 'gothic', 'rustic', 'steampunk', 'elven', 'desert', 'underwater', 'colonial'] as const;

export function fitStructurePlanToEnvelope(plan: StructurePlan, target: { width: number; height: number; length: number }): StructurePlan {
  const dimensions = {
    width: clamp(target.width, 8, MAX_STRUCTURE_DIMENSION),
    height: clamp(target.height, 8, MAX_STRUCTURE_DIMENSION),
    length: clamp(target.length, 8, MAX_STRUCTURE_DIMENSION),
  };
  const occupied = occupiedPlanBounds(plan);
  if (!occupied) return { ...plan, dimensions };

  const axis = (name: 'x' | 'y' | 'z') => ({ min: occupied[`min${name.toUpperCase()}` as 'minX' | 'minY' | 'minZ'], span: occupied[`span${name.toUpperCase()}` as 'spanX' | 'spanY' | 'spanZ'], size: dimensions[name === 'x' ? 'width' : name === 'y' ? 'height' : 'length'] });
  const mapStart = (value: number, name: 'x' | 'y' | 'z') => {
    const current = axis(name);
    return clamp(Math.round((value - current.min) * current.size / Math.max(1, current.span)), 0, current.size - 1);
  };
  const mapEnd = (value: number, name: 'x' | 'y' | 'z') => {
    const current = axis(name);
    return clamp(Math.round((value - current.min) * current.size / Math.max(1, current.span)), 1, current.size);
  };
  const mapBox = (box: { x: number; y: number; z: number; width: number; height: number; length: number }) => {
    const x = mapStart(box.x, 'x'); const y = mapStart(box.y, 'y'); const z = mapStart(box.z, 'z');
    return { x, y, z, width: Math.max(1, mapEnd(box.x + box.width, 'x') - x), height: Math.max(1, mapEnd(box.y + box.height, 'y') - y), length: Math.max(1, mapEnd(box.z + box.length, 'z') - z) };
  };
  const mapPoint = (value: number, name: 'x' | 'y' | 'z') => mapStart(value, name);
  const mappedRegions = plan.regions.map((region) => ({ ...region, ...mapBox(region) }));
  const mappedGeometry = plan.geometry ? { parts: plan.geometry.parts.map((part) => ({ ...part, ...mapBox(part) })) } : plan.geometry;
  const regions = mappedRegions.length > 1 || !mappedGeometry?.parts?.length ? mappedRegions : regionsFromGeometry(mappedGeometry.parts, dimensions);
  return {
    ...plan,
    dimensions,
    regions,
    rooms: plan.rooms.map((room) => ({ ...room, ...mapBox(room) })),
    components: plan.components.map((component) => ({ ...component, x: mapPoint(component.x, 'x'), y: mapPoint(component.y, 'y'), z: mapPoint(component.z, 'z') })),
    geometry: mappedGeometry,
    notes: [...plan.notes, `The requested hard dimensions were applied to the built footprint: ${dimensions.width} x ${dimensions.height} x ${dimensions.length} blocks.`],
  };
}

function regionsFromGeometry(parts: GeometryPart[], dimensions: { width: number; height: number; length: number }): StructureRegionPlan[] {
  const labels: Record<string, string> = { structure: 'Structure', room: 'Rooms', partition: 'Partitions', circulation: 'Circulation', furniture: 'Furniture', lighting: 'Lighting', roof: 'Roof', opening: 'Openings', decoration: 'Decoration' };
  const groups = new Map<string, GeometryPart[]>();
  for (const part of parts) { const key = part.purpose || part.type; const group = groups.get(key); if (group) group.push(part); else groups.set(key, [part]); }
  return [...groups.entries()].map(([key, group]) => {
    const bounds = group.reduce((acc, part) => ({ minX: Math.min(acc.minX, part.x), minY: Math.min(acc.minY, part.y), minZ: Math.min(acc.minZ, part.z), maxX: Math.max(acc.maxX, part.x + part.width), maxY: Math.max(acc.maxY, part.y + part.height), maxZ: Math.max(acc.maxZ, part.z + part.length) }), { minX: dimensions.width, minY: dimensions.height, minZ: dimensions.length, maxX: 0, maxY: 0, maxZ: 0 });
    return { name: labels[key] || key, role: (labels[key] || key) + ' geometry', x: bounds.minX, y: bounds.minY, z: bounds.minZ, width: Math.max(1, bounds.maxX - bounds.minX), height: Math.max(1, bounds.maxY - bounds.minY), length: Math.max(1, bounds.maxZ - bounds.minZ) };
  });
}
function occupiedPlanBounds(plan: StructurePlan): { minX: number; minY: number; minZ: number; spanX: number; spanY: number; spanZ: number } | null {
  const boxes = plan.geometry?.parts?.length
    ? plan.geometry.parts
    : plan.regions.filter((region) => !/unassigned|background|ground|base plane/i.test(`${region.name} ${region.role}`));
  if (!boxes.length) return null;
  const bounds = boxes.reduce((acc, box) => ({
    minX: Math.min(acc.minX, box.x), minY: Math.min(acc.minY, box.y), minZ: Math.min(acc.minZ, box.z),
    maxX: Math.max(acc.maxX, box.x + box.width), maxY: Math.max(acc.maxY, box.y + box.height), maxZ: Math.max(acc.maxZ, box.z + box.length),
  }), { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity });
  return { minX: bounds.minX, minY: bounds.minY, minZ: bounds.minZ, spanX: Math.max(1, bounds.maxX - bounds.minX), spanY: Math.max(1, bounds.maxY - bounds.minY), spanZ: Math.max(1, bounds.maxZ - bounds.minZ) };
}
export function planBuilding(input: BuildingPrompt): StructurePlan {
  const prompt = input.prompt?.trim();
  if (!prompt) throw new Error('Building prompt is required.');

  const text = prompt.toLowerCase();
  const requestedType = input.constraints?.type?.trim().toLowerCase();
  const type = (requestedType && requestedType !== 'ai_auto' ? requestedType : findKeyword(text, [
    ['city', 'city'], ['harbor', 'harbor'], ['palace', 'palace'], ['industrial', 'industrial'],
    ['castle', 'castle'], ['城堡', 'castle'], ['tower', 'tower'], ['塔楼', 'tower'], ['塔', 'tower'],
    ['cathedral', 'cathedral'], ['教堂', 'cathedral'], ['village', 'village'], ['村庄', 'village'],
    ['村', 'village'], ['ship', 'ship'], ['船', 'ship'], ['bridge', 'bridge'], ['桥', 'bridge'],
    ['windmill', 'windmill'], ['风车', 'windmill'], ['dungeon', 'dungeon'], ['地牢', 'dungeon'],
    ['city', 'city'], ['harbor', 'harbor'], ['palace', 'palace'], ['industrial', 'industrial'],
  ]) as StructurePlan['type'] ?? 'house');
  const requestedStyle = input.constraints?.style?.trim().toLowerCase();
  const style = (requestedStyle && requestedStyle !== 'ai_auto' ? requestedStyle : findKeyword(text, [
    ['modern', 'modern'], ['现代', 'modern'], ['gothic', 'gothic'], ['哥特', 'gothic'],
    ['desert', 'desert'], ['沙漠', 'desert'], ['medieval', 'medieval'], ['中世纪', 'medieval'],
    ['steampunk', 'steampunk'], ['蒸汽朋克', 'steampunk'], ['elven', 'elven'], ['精灵', 'elven'],
    ['underwater', 'underwater'], ['水下', 'underwater'], ['rustic', 'rustic'], ['乡村', 'rustic'],
  ]) as StructurePlan['style'] ?? 'fantasy');
  const requestedHeight = input.constraints?.height;
  const floors = clamp(input.constraints?.floors ?? parseNumber(text, /(?:floors?|层数?|层)\s*[:：]?\s*(\d+)/, 2), 1, 64);
  const width = clamp(input.constraints?.width ?? parseNumber(text, /(?:width|宽度|宽)\s*[:：]?\s*(\d+)/, type === 'tower' ? 14 : 24), 8, MAX_STRUCTURE_DIMENSION);
  const length = clamp(input.constraints?.length ?? parseNumber(text, /(?:length|深度|长度|长)\s*[:：]?\s*(\d+)/, width), 8, MAX_STRUCTURE_DIMENSION);
  const height = clamp(requestedHeight ?? floors * 4 + 2, Math.max(8, floors * 3 + 2), MAX_STRUCTURE_DIMENSION);
  const components: ComponentPlan[] = [
    { id: 'entrance', type: 'door', x: Math.floor(width / 2), y: 1, z: 0, options: { facing: 'south' } },
    { id: 'windows', type: 'window-bay', x: 2, y: 2, z: 0, options: { count: Math.max(2, Math.floor(width / 4)) } },
    { id: 'roof', type: type === 'tower' ? 'flat' : 'gable', x: 0, y: height - 1, z: 0, options: { overhang: 1 } },
  ];
  const regions: StructureRegionPlan[] = [
    { name: 'main', role: 'main structure', x: 0, y: 0, z: 0, width, height: Math.max(1, height - 2), length },
    { name: 'roof', role: 'roof', x: 0, y: Math.max(0, height - 2), z: 0, width, height: Math.min(2, height), length },
  ];

  if (containsAny(text, ['庭院', 'courtyard'])) {
    const courtyardLength = Math.max(1, Math.floor(length / 3));
    components.push({ id: 'courtyard', type: 'courtyard', x: 3, y: 1, z: Math.floor(length / 2), options: { size: Math.floor(Math.min(width, length) / 3) } });
    regions.push({ name: 'courtyard', role: 'courtyard', x: 3, y: 0, z: Math.floor(length / 3), width: Math.max(1, width - 6), height: 1, length: courtyardLength });
  }
  if (containsAny(text, ['塔楼', 'turret']) || type === 'tower') {
    components.push({ id: 'turret', type: 'turret', x: width - 5, y: 0, z: length - 5, options: { floors } });
    regions.push({ name: 'tower', role: 'tower', x: Math.max(0, width - 6), y: 0, z: Math.max(0, length - 6), width: Math.min(6, width), height, length: Math.min(6, length) });
  }

  const plan: StructurePlan = {
    version: 1,
    name: `${style} ${type}`,
    type,
    style,
    dimensions: { width, height, length },
    floors,
    rooms: [{ id: 'main-hall', type: 'hall', floor: 0, x: 2, y: 1, z: 2, width: width - 4, height: 3, length: length - 4 }],
    regions,
    components,
    palette: paletteFor(style),
    seed: input.seed ?? 42,
    notes: [input.referenceImage ? 'Reference image supplied; local preview uses heuristic facade analysis and is not a strict visual match.' : 'Generated from natural-language constraints.'],
    inference: { source: input.referenceImage ? 'reference-heuristic' : 'prompt', detectedType: type, detectedStyle: style, confidence: input.referenceImage ? 0.35 : 0.6 },
  };
  return addLocalDetailGeometry(plan, input.constraints);
}

export function planBuildingFromReference(input: BuildingPrompt): StructurePlan {
  if (!input.referenceImage) throw new Error('A reference image is required.');
  const image = input.referenceImage;
  const aspect = image.width / Math.max(1, image.height);
  const pixels = image.pixels instanceof Uint8Array ? image.pixels : image.pixels ? Uint8Array.from(image.pixels) : new Uint8Array();
  let brightness = 0;
  for (let index = 0; index + 2 < pixels.length; index += 4) brightness += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
  brightness /= Math.max(1, Math.floor(pixels.length / 4));
  const features = image.referenceFeatures ?? analyzeReferencePixels(image);
  const base = planBuilding({ ...input, prompt: input.prompt || 'house' });
  const subjectAspect = (features.subjectBounds.right - features.subjectBounds.left) / Math.max(0.1, features.subjectBounds.bottom - features.subjectBounds.top);
  const type = features.towerColumns.length >= 2 ? 'tower' : subjectAspect < 0.72 ? 'tower' : subjectAspect > 1.45 ? 'castle' : base.type;
  const style = brightness < 85 ? 'gothic' : brightness > 190 ? 'modern' : base.style;
  const floors = clamp(input.constraints?.floors ?? (features.floorBands.length || Math.round(image.height / Math.max(1, image.width) * 8)), 1, 64);
  const width = clamp(input.constraints?.width ?? Math.round(24 * (features.subjectBounds.right - features.subjectBounds.left)), 12, MAX_STRUCTURE_DIMENSION);
  const length = clamp(input.constraints?.length ?? Math.round(width / Math.max(0.65, Math.min(1.6, subjectAspect))), 12, MAX_STRUCTURE_DIMENSION);
  const height = clamp(input.constraints?.height ?? Math.round((features.subjectBounds.bottom - features.subjectBounds.top) * 48), Math.max(8, floors * 4 + 3), MAX_STRUCTURE_DIMENSION);
  const plan = planBuilding({ ...input, prompt: `${style} ${type} floors ${floors} width ${width} length ${length}`, constraints: { ...input.constraints, floors, width, height, length }, referenceImage: image });
  const components = plan.components.filter((component) => component.type !== 'window-bay' && component.type !== 'roof');
  components.push({ id: 'reference-silhouette', type: 'reference-silhouette', x: 0, y: 0, z: 0, options: { count: features.silhouette.length, size: Math.round(features.depthRatio * 100) } });
  components.push({ id: 'reference-windows', type: 'reference-window-bays', x: 0, y: 0, z: 0, options: { count: features.windowColumns.length, size: features.floorBands.length } });
  if (features.towerColumns.length) components.push({ id: 'reference-towers', type: 'reference-towers', x: 0, y: 0, z: 0, options: { count: features.towerColumns.length, size: 3 } });
  return addLocalDetailGeometry({
    ...plan,
    dimensions: { width, height, length },
    floors,
    components,
    regions: [{ name: 'main', role: 'reference silhouette', x: 0, y: 0, z: 0, width, height: Math.max(1, height - 2), length }, { name: 'roof', role: 'reference roof', x: 0, y: Math.max(1, height - 2), z: 0, width, height: 2, length }],
    rooms: [{ id: 'reference-interior', type: 'hall', floor: 0, x: 2, y: 1, z: 2, width: Math.max(1, width - 4), height: Math.max(3, Math.floor(height / Math.max(1, floors))), length: Math.max(1, length - 4) }],
    referenceFeatures: features,
    notes: [...plan.notes, `Reference silhouette extracted from ${image.width}x${image.height} pixels; facade profile and window rhythm are applied to the voxel grid.`],
    inference: { source: 'reference-heuristic', detectedType: type, detectedStyle: style, confidence: 0.72 },
  }, input.constraints);
}

function addLocalDetailGeometry(plan: StructurePlan, constraints?: BuildingPrompt['constraints']): StructurePlan {
  if (plan.geometry?.parts?.length || !constraints) return plan;
  const { width, height, length } = plan.dimensions;
  const detailLevel = clamp(constraints.detailLevel ?? 3, 1, 5);
  const includeInterior = constraints.includeInterior !== false;
  const sparseEnvelope = 2 * width * height + 2 * length * height + 2 * width * length > MAX_GENERATED_BLOCKS * 0.55;
  const parts: GeometryPart[] = [
    {
      id: 'main-envelope', type: 'shell', x: 0, y: 0, z: 0, width, height, length,
      material: plan.palette.wall, hollow: true, thickness: 1, openSides: sparseEnvelope ? ['top', 'bottom'] : [], purpose: 'structure',
    },
  ];
  const floorHeight = Math.max(3, Math.floor((height - 2) / Math.max(1, plan.floors)));
  const interiorFloors = includeInterior ? plan.floors : 0;
  const floorArea = Math.max(1, (width - 2) * (length - 2));
  const fullFloorBudget = Math.max(0, MAX_GENERATED_BLOCKS - (sparseEnvelope ? 2 * width * height + 2 * length * height : Math.min(MAX_GENERATED_BLOCKS, floorArea)));
  const canUseFullFloors = !sparseEnvelope && floorArea * interiorFloors <= fullFloorBudget * 0.45;
  for (let floor = 0; floor < interiorFloors; floor += 1) {
    const y = Math.min(height - 2, 1 + floor * floorHeight);
    if (canUseFullFloors || floor === 0 || floor % Math.max(1, Math.ceil(interiorFloors / 8)) === 0) {
      parts.push({ id: `floor-${floor + 1}`, type: canUseFullFloors ? 'surface' : 'beam', x: 1, y, z: 1, width: width - 2, height: 1, length: length - 2, material: plan.palette.floor, purpose: 'room' });
    }
    if (!includeInterior || detailLevel < 3) continue;
    const roomWidth = Math.max(4, Math.floor((width - 4) / 2));
    const roomLength = Math.max(4, Math.floor((length - 4) / 2));
    const roomY = Math.min(height - 4, y + 1);
    if (detailLevel >= 4) {
      parts.push(
        { id: `room-${floor + 1}-west`, type: 'shell', x: 2, y: roomY, z: 2, width: roomWidth, height: Math.min(3, height - roomY), length: roomLength, material: plan.palette.wall, hollow: true, thickness: 1, openSides: ['bottom', 'top'], purpose: 'room' },
        { id: `room-${floor + 1}-east`, type: 'shell', x: Math.max(2, width - roomWidth - 2), y: roomY, z: Math.max(2, length - roomLength - 2), width: roomWidth, height: Math.min(3, height - roomY), length: roomLength, material: plan.palette.wall, hollow: true, thickness: 1, openSides: ['bottom', 'top'], purpose: 'partition' },
      );
    }
    if (floor < interiorFloors - 1 || floor === 0) {
      parts.push({ id: `stairs-${floor + 1}`, type: 'stairs', x: Math.max(2, Math.floor(width / 2)), y, z: Math.max(2, Math.floor(length / 2)), width: 2, height: Math.min(floorHeight, 8), length: Math.min(floorHeight, 8), material: plan.palette.floor, facing: 'south', purpose: 'circulation' });
    }
    if (detailLevel >= 4) {
      const furniture = [
        ['table', 'minecraft:oak_planks'], ['chair', 'minecraft:oak_stairs'], ['lamp', 'minecraft:lantern'],
      ] as const;
      for (const [name, material] of furniture) {
        parts.push({ id: `${name}-${floor + 1}`, type: name === 'chair' ? 'stairs' : 'box', x: Math.max(2, Math.floor(width / 2) + (name === 'table' ? -2 : name === 'chair' ? 1 : 0)), y: roomY, z: Math.max(2, Math.floor(length / 2) + (name === 'lamp' ? 2 : 0)), width: 1, height: 1, length: 1, material, facing: 'south', purpose: 'furniture' });
      }
    }
  }
  const roofHeight = Math.min(8, Math.max(2, Math.floor(Math.min(width, length) / 8)));
  if (sparseEnvelope) {
    parts.push(
      { id: 'roof-ridge', type: 'beam', x: 0, y: height - 1, z: Math.floor(length / 2), width, height: 1, length: 1, material: plan.palette.roof, purpose: 'roof' },
      { id: 'roof-crossbeam', type: 'beam', x: Math.floor(width / 2), y: height - 2, z: 0, width: 1, height: 1, length, material: plan.palette.roof, purpose: 'roof' },
    );
  } else {
    parts.push({ id: 'main-roof', type: 'roof', x: 0, y: Math.max(0, height - roofHeight), z: 0, width, height: roofHeight, length, material: plan.palette.roof, roofStyle: 'gable', ridgeAxis: width >= length ? 'x' : 'z', purpose: 'roof' });
  }
  return { ...plan, geometry: { parts }, notes: [...plan.notes, `Local preview uses ${detailLevel}/5 detail with ${includeInterior ? 'walkable interior' : 'exterior-only'} geometry.`] };
}

export function attachReferenceFeatures(plan: StructurePlan, features?: ReferenceFeatures): StructurePlan {
  if (!features) return plan;
  return {
    ...plan,
    referenceFeatures: features,
    notes: [...plan.notes, 'Pixel-derived reference silhouette is retained and applied during voxelization.'],
    inference: { ...plan.inference, source: 'vision-model', confidence: Math.max(plan.inference?.confidence ?? 0, 0.72) },
  };
}

export function analyzeReferencePixels(image: { width: number; height: number; pixels?: Uint8Array | number[] }): ReferenceFeatures {
  const pixels = image.pixels instanceof Uint8Array ? image.pixels : image.pixels ? Uint8Array.from(image.pixels) : new Uint8Array();
  const sampleWidth = Math.max(8, Math.round(48 * Math.min(1, image.width / Math.max(1, image.height))));
  const sampleHeight = Math.max(8, Math.round(48 * Math.min(1, image.height / Math.max(1, image.width))));
  const sample = (x: number, y: number) => {
    const sx = Math.min(image.width - 1, Math.max(0, Math.floor((x + 0.5) * image.width / sampleWidth)));
    const sy = Math.min(image.height - 1, Math.max(0, Math.floor((y + 0.5) * image.height / sampleHeight)));
    const index = (sy * image.width + sx) * 4;
    return { r: pixels[index] ?? 0, g: pixels[index + 1] ?? 0, b: pixels[index + 2] ?? 0, a: pixels[index + 3] ?? 255 };
  };
  const border = [sample(0, 0), sample(sampleWidth - 1, 0), sample(0, sampleHeight - 1), sample(sampleWidth - 1, sampleHeight - 1)];
  const background = border.reduce((acc, color) => ({ r: acc.r + color.r / border.length, g: acc.g + color.g / border.length, b: acc.b + color.b / border.length }), { r: 0, g: 0, b: 0 });
  const distance = (color: { r: number; g: number; b: number; a: number }) => Math.sqrt((color.r - background.r) ** 2 + (color.g - background.g) ** 2 + (color.b - background.b) ** 2);
  const hasPixels = pixels.length >= image.width * image.height * 4;
  const rawMask = Array.from({ length: sampleHeight }, (_, y) => Array.from({ length: sampleWidth }, (_, x) => {
    const color = sample(x, y);
    return hasPixels
      ? color.a > 24 && (color.a < 245 || distance(color) > 34)
      : x >= Math.round(sampleWidth * 0.18) && x < Math.round(sampleWidth * 0.82) && y >= Math.round(sampleHeight * 0.12) && y < Math.round(sampleHeight * 0.88);
  }));
  const mask = keepReferenceComponents(rawMask);
  const points = mask.flatMap((row, y) => row.map((filled, x) => filled ? { x, y } : null).filter(Boolean) as Array<{ x: number; y: number }>);
  if (!points.length) return { sourceWidth: image.width, sourceHeight: image.height, subjectBounds: { left: 0.08, top: 0.08, right: 0.92, bottom: 0.92 }, silhouette: Array.from({ length: 16 }, () => 0.15), towerColumns: [], windowColumns: [], floorBands: [0.25, 0.5, 0.75], symmetry: 1, depthRatio: 0.6, maskWidth: sampleWidth, maskHeight: sampleHeight, frontMask: mask.flat().map((value) => value ? 1 : 0), roofMask: mask.flat().map((value) => value ? 1 : 0), colorMask: Array.from({ length: sampleWidth * sampleHeight }, () => 0), colorPalette: [{ r: 128, g: 128, b: 128 }], depthProfile: Array.from({ length: sampleHeight }, () => 0.6) };
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const silhouette = Array.from({ length: 16 }, (_, index) => {
    const x = Math.round(minX + (maxX - minX) * index / 15);
    const ys = points.filter((point) => Math.abs(point.x - x) <= 1).map((point) => point.y);
    return ys.length ? (Math.min(...ys) - minY) / Math.max(1, maxY - minY) : 1;
  });
  const medianTop = [...silhouette].sort((a, b) => a - b)[Math.floor(silhouette.length / 2)];
  const towerColumns = silhouette.map((top, index) => top < medianTop - 0.16 ? index : -1).filter((index) => index >= 0);
  const rowFill = Array.from({ length: sampleHeight }, (_, y) => mask[y].filter(Boolean).length / sampleWidth);
  const floorBands = rowFill.map((fill, y) => ({ fill, y })).filter(({ fill, y }) => fill > 0.22 && y > minY && y < maxY && (rowFill[y - 1] - fill > 0.08 || fill - rowFill[y + 1] > 0.08)).map(({ y }) => (y - minY) / Math.max(1, maxY - minY)).filter((value, index, values) => index === 0 || value - values[index - 1] > 0.08).slice(0, 8);
  const windowColumns = Array.from({ length: 12 }, (_, index) => index).filter((index) => {
    const x = Math.round(minX + (maxX - minX) * (index + 1) / 13);
    const dark = points.filter((point) => Math.abs(point.x - x) <= 1 && point.y > minY + 5 && point.y < maxY - 2).length;
    return dark > Math.max(3, (maxY - minY) * 0.18);
  });
  const mirrorErrors = silhouette.map((value, index) => Math.abs(value - silhouette[silhouette.length - 1 - index]));
  const roofMask = mask.map((row, y) => row.map((filled, x) => filled && y <= minY + Math.max(2, Math.floor((maxY - minY) * 0.22)) && Math.abs(x - (minX + maxX) / 2) < (maxX - minX) * 0.55)).flat().map((value) => value ? 1 : 0);
  const colorIndex = new Map<string, number>();
  const colorPalette: Array<{ r: number; g: number; b: number }> = [];
  const colorMask: number[] = [];
  for (let y = 0; y < sampleHeight; y += 1) for (let x = 0; x < sampleWidth; x += 1) {
    const color = sample(x, y);
    const quantized = { r: Math.round(color.r / 32) * 32, g: Math.round(color.g / 32) * 32, b: Math.round(color.b / 32) * 32 };
    const key = `${quantized.r},${quantized.g},${quantized.b}`;
    if (!colorIndex.has(key)) { colorIndex.set(key, colorPalette.length); colorPalette.push(quantized); }
    colorMask.push(colorIndex.get(key) ?? 0);
  }
  const maxFill = Math.max(1, ...mask.map((row) => row.filter(Boolean).length));
  const depthProfile = mask.map((row) => Math.max(0.25, Math.min(1, row.filter(Boolean).length / maxFill)));
  return { sourceWidth: image.width, sourceHeight: image.height, subjectBounds: { left: minX / sampleWidth, top: minY / sampleHeight, right: (maxX + 1) / sampleWidth, bottom: (maxY + 1) / sampleHeight }, silhouette, towerColumns, windowColumns, floorBands, symmetry: 1 - mirrorErrors.reduce((sum, value) => sum + value, 0) / silhouette.length, depthRatio: Math.max(0.35, Math.min(1, (maxX - minX + 1) / Math.max(1, maxY - minY + 1))), maskWidth: sampleWidth, maskHeight: sampleHeight, frontMask: mask.flat().map((value) => value ? 1 : 0), roofMask, colorMask, colorPalette, depthProfile };
}

function keepReferenceComponents(mask: boolean[][]): boolean[][] {
  const height = mask.length;
  const width = mask[0]?.length ?? 0;
  const visited = new Uint8Array(width * height);
  const components: number[][] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const start = y * width + x;
    if (!mask[y][x] || visited[start]) continue;
    const queue = [start];
    const component: number[] = [];
    visited[start] = 1;
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      component.push(current);
      const cx = current % width;
      const cy = Math.floor(current / width);
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!mask[ny][nx] || visited[next]) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    components.push(component);
  }
  const largest = Math.max(0, ...components.map((component) => component.length));
  const minimumDetailArea = Math.max(2, Math.floor(largest * 0.01));
  const kept = new Uint8Array(width * height);
  for (const component of components) if (component.length >= minimumDetailArea) for (const index of component) kept[index] = 1;
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => kept[y * width + x] === 1));
}

export function validateStructurePlan(plan: StructurePlan): StructurePlan {
  if (!plan || plan.version !== 1) throw new Error('Unsupported StructurePlan version.');
  if (plan.referenceFacing != null && !['x-min', 'x-max', 'z-min', 'z-max'].includes(plan.referenceFacing)) throw new Error('StructurePlan referenceFacing must be x-min, x-max, z-min or z-max.');
  const { width, height, length } = plan.dimensions;
  for (const value of [width, height, length, plan.floors]) if (!Number.isInteger(value) || value < 1) throw new Error('StructurePlan dimensions and floors must be positive integers.');
  if ([width, height, length].some((value) => value > MAX_STRUCTURE_DIMENSION)) throw new Error(`StructurePlan dimensions cannot exceed ${MAX_STRUCTURE_DIMENSION} blocks per axis.`);
  if ((plan.geometry?.parts?.length ?? 0) > 1024) throw new Error('StructurePlan exceeds the 1,024 geometry-part limit.');
  if (!Array.isArray(plan.regions) || plan.regions.length === 0) throw new Error('StructurePlan must contain at least one named region.');
  const names = new Set<string>();
  for (const region of plan.regions) {
    if (!region.name?.trim() || names.has(region.name)) throw new Error(`StructurePlan has a duplicate or empty region name: ${region.name}`);
    names.add(region.name);
    if (![region.x, region.y, region.z, region.width, region.height, region.length].every(Number.isInteger)) throw new Error(`Region '${region.name}' has non-integer bounds.`);
    if (region.width < 1 || region.height < 1 || region.length < 1 || region.x < 0 || region.y < 0 || region.z < 0 || region.x + region.width > width || region.y + region.height > height || region.z + region.length > length) throw new Error(`Region '${region.name}' is outside the StructurePlan dimensions.`);
  }
  for (const room of plan.rooms ?? []) if (room.x < 0 || room.y < 0 || room.z < 0 || room.x + room.width > width || room.y + room.height > height || room.z + room.length > length) throw new Error(`Room '${room.id}' is outside the StructurePlan dimensions.`);
  for (const part of plan.geometry?.parts ?? []) {
    if (!part.id?.trim() || !['box', 'shell', 'roof', 'cylinder', 'arch', 'stairs', 'beam', 'surface'].includes(part.type)) throw new Error(`Geometry part '${part.id}' has an unsupported type.`);
    if (![part.x, part.y, part.z, part.width, part.height, part.length].every(Number.isInteger) || part.width < 1 || part.height < 1 || part.length < 1) throw new Error(`Geometry part '${part.id}' has invalid bounds.`);
    if (part.x < 0 || part.y < 0 || part.z < 0 || part.x + part.width > width || part.y + part.height > height || part.z + part.length > length) throw new Error(`Geometry part '${part.id}' is outside the StructurePlan dimensions.`);
    if (!part.material || !/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(part.material)) throw new Error(`Geometry part '${part.id}' has an invalid Minecraft material.`);
  }
  for (const role of ['wall', 'floor', 'roof', 'window'] as const) {
    const blockId = plan.palette?.[role];
    if (!blockId || !/^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(blockId)) {
      throw new Error(`StructurePlan palette '${role}' must be a block ID without block-state properties.`);
    }
  }
  return plan;
}

export function createLitematicaPlannerInstruction(): string {
  return 'Return JSON StructurePlan version 1. Treat Litematica as a named multi-region schematic format. When a reference image is supplied, follow it as the primary source: reconstruct visible silhouette, proportions, floors, roof geometry, windows, towers, courtyards, facade rhythm, materials, and distinctive landmarks. Do not invent a generic preset when the image contradicts it. Keep xyz coordinates, positive integer dimensions, non-overflowing named regions, rooms, components, seed, notes, and inference source/confidence. Palette wall/floor/roof/window values must be plain namespaced Minecraft block IDs only (for example minecraft:glass_pane); never append [property=value] to palette values. Regions are local sub-volumes with x/y/z and width/height/length; do not return a flat image or only a material list. The result must be suitable for BlockGrid conversion and Litematic export.';
}

export type PlannedRegionGrid = {
  name: string;
  grid: BlockGrid;
  position: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
};

export function structurePlanToRegionGrids(plan: StructurePlan, existingGrid?: BlockGrid): PlannedRegionGrid[] {
  validateStructurePlan(plan);
  const whole = existingGrid ?? structurePlanToGrid(plan);
  const cellsByRegion = plan.regions.map(() => [] as BlockGrid['cells']);
  const unassignedCells: BlockGrid['cells'] = [];
  for (const cell of whole.cells) {
    let assigned = false;
    for (let index = plan.regions.length - 1; index >= 0; index -= 1) {
      const region = plan.regions[index];
      const contains = cell.x >= region.x && cell.x < region.x + region.width && cell.y >= region.y && cell.y < region.y + region.height && cell.z >= region.z && cell.z < region.z + region.length;
      if (!contains) continue;
      cellsByRegion[index].push({ ...cell, x: cell.x - region.x, y: cell.y - region.y, z: cell.z - region.z });
      assigned = true;
      break;
    }
    if (!assigned) unassignedCells.push(cell);
  }
  const plannedRegions = plan.regions.map((region, index) => compactPlannedRegion(region.name, cellsByRegion[index], { x: region.x, y: region.y, z: region.z })).filter((region): region is PlannedRegionGrid => region !== null);
  if (!unassignedCells.length) return plannedRegions;

  const min = {
    x: Math.min(...unassignedCells.map((cell) => cell.x)),
    y: Math.min(...unassignedCells.map((cell) => cell.y)),
    z: Math.min(...unassignedCells.map((cell) => cell.z)),
  };
  const max = {
    x: Math.max(...unassignedCells.map((cell) => cell.x)),
    y: Math.max(...unassignedCells.map((cell) => cell.y)),
    z: Math.max(...unassignedCells.map((cell) => cell.z)),
  };
  const size = { x: max.x - min.x + 1, y: max.y - min.y + 1, z: max.z - min.z + 1 };
  const regionNames = new Set(plan.regions.map((region) => region.name));
  let name = 'Unassigned structure';
  for (let suffix = 2; regionNames.has(name); suffix += 1) name = `Unassigned structure ${suffix}`;
  plannedRegions.push({
    name,
    grid: createGrid(unassignedCells.map((cell) => ({ ...cell, x: cell.x - min.x, y: cell.y - min.y, z: cell.z - min.z })), { width: size.x, height: size.y, length: size.z }, 'user'),
    position: min,
    size,
  });
  return plannedRegions;
}

function compactPlannedRegion(name: string, cells: BlockGrid['cells'], origin: { x: number; y: number; z: number }): PlannedRegionGrid | null {
  if (!cells.length) return null;
  let minX = Infinity; let minY = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const cell of cells) { minX = Math.min(minX, cell.x); minY = Math.min(minY, cell.y); minZ = Math.min(minZ, cell.z); maxX = Math.max(maxX, cell.x); maxY = Math.max(maxY, cell.y); maxZ = Math.max(maxZ, cell.z); }
  const size = { x: maxX - minX + 1, y: maxY - minY + 1, z: maxZ - minZ + 1 };
  const gridSize = { width: size.x, height: size.y, length: size.z };
  const compactCells = cells.map((cell) => ({ ...cell, x: cell.x - minX, y: cell.y - minY, z: cell.z - minZ }));
  return { name, grid: createGrid(compactCells, gridSize, 'user'), position: { x: origin.x + minX, y: origin.y + minY, z: origin.z + minZ }, size };
}
export function structurePlanToGrid(plan: StructurePlan): BlockGrid {
  validateStructurePlan(plan);
  const { width, height, length } = plan.dimensions;
  const cells = new Map<string, BlockGrid['cells'][number]>();
  const put = (x: number, y: number, z: number, role: string, properties?: Record<string, string>) => {
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= length) return;
    const block = plan.palette[role] ?? (role === 'accent' ? 'minecraft:red_concrete' : plan.palette.wall);
    putState(x, y, z, block, properties);
  };
  const putId = (x: number, y: number, z: number, id: string, properties?: Record<string, string>) => putState(x, y, z, id, properties);
  const putState = (x: number, y: number, z: number, id: string, properties?: Record<string, string>) => {
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= length) return;
    const key = `${x},${y},${z}`;
    if (!cells.has(key) && cells.size >= MAX_GENERATED_BLOCKS) throw new Error(`Generated building exceeds the ${MAX_GENERATED_BLOCKS.toLocaleString()} block limit. Reduce dimensions or detail level.`);
    cells.set(key, { x, y, z, block: { id, ...(properties ? { properties } : {}) }, source: 'user' });
  };
  const remove = (x: number, y: number, z: number) => cells.delete(`${x},${y},${z}`);

  if (plan.geometry?.parts?.length) {
    addGeometryParts(put, putId, plan.geometry.parts, plan);
    addVisionComponents(putId, plan);
    return validateGrid(createGrid([...cells.values()], { width, height, length }, 'user'));
  }
  if (plan.inference?.source === 'vision-model' && plan.regions.length > 0) {
    addVisionRegions(put, putId, remove, plan);
    return validateGrid(createGrid([...cells.values()], { width, height, length }, 'user'));
  }

  const body = mainBuildingBounds(plan);
  const bodyTop = Math.min(height, body.y + body.height);
  const spire = plan.components.find((component) => /spire|steeple|pyramid|dome/i.test(`${component.id} ${component.type}`));
  const spireRegion = plan.regions.find((region) => /spire|steeple|dome/i.test(`${region.name} ${region.role}`));
  const roofRegion = plan.regions.find((region) => /roof|gable/i.test(`${region.name} ${region.role}`));
  const roofComponent = plan.components.find((component) => /roof|gable|flat/i.test(`${component.id} ${component.type}`));
  const roofY = clamp(spire?.y ?? spireRegion?.y ?? roofRegion?.y ?? bodyTop - 1, body.y + 3, height - 1);
  const reference = plan.referenceFeatures;
  const hasReferenceProfile = Boolean(reference?.silhouette?.length);
  const facadeTop = (x: number) => {
    if (!reference?.silhouette?.length) return roofY;
    const position = (x - body.x) / Math.max(1, body.width - 1);
    const sampleIndex = Math.max(0, Math.min(reference.silhouette.length - 1, Math.round(position * (reference.silhouette.length - 1))));
    const topOffset = Math.round(reference.silhouette[sampleIndex] * Math.max(1, body.height - 2));
    return Math.max(body.y + 3, Math.min(roofY, body.y + body.height - 1 - topOffset));
  };
  const floorHeight = Math.max(3, Math.floor((bodyTop - body.y) / Math.max(1, plan.floors)));
  const roomDecks = (plan.rooms ?? []).map((room) => room.y - 1).filter((y) => y > body.y && y < roofY);
  const deckYs = new Set<number>([body.y]);
  for (let floor = 1; floor < plan.floors; floor += 1) {
    const y = body.y + floor * floorHeight;
    if (y < roofY) deckYs.add(y);
  }
  for (const y of roomDecks) deckYs.add(y);

  for (let z = 0; z < length; z += 1) {
    for (let x = 0; x < width; x += 1) put(x, body.y, z, 'floor');
  }

  for (let y = body.y + 1; y < roofY; y += 1) {
    for (let x = body.x; x < body.x + body.width; x += 1) {
      if (y <= facadeTop(x)) {
        put(x, y, body.z, 'wall');
        put(x, y, body.z + body.length - 1, 'wall');
      }
    }
    for (let z = body.z + 1; z < body.z + body.length - 1; z += 1) {
      if (y <= facadeTop(body.x)) put(body.x, y, z, 'wall');
      if (y <= facadeTop(body.x + body.width - 1)) put(body.x + body.width - 1, y, z, 'wall');
    }
  }

  const stairX = body.x + Math.floor(body.width / 2);
  const stairZ = body.z + Math.floor(body.length / 2);
  for (const y of deckYs) {
    for (let z = body.z + 1; z < body.z + body.length - 1; z += 1) {
      for (let x = body.x + 1; x < body.x + body.width - 1; x += 1) {
        const stairwell = Math.abs(x - stairX) <= 1 && Math.abs(z - stairZ) <= 1;
        if (!stairwell) put(x, y, z, 'floor');
      }
    }
  }

  const windowLevels = [...deckYs].filter((y) => y + 3 < roofY).sort((a, b) => a - b);
  const windowCount = Math.max(1, Math.min(4, Math.floor(Math.min(body.width, body.length) / 5)));
  const addWindow = (x: number, y: number, z: number) => {
    for (let offset = 1; offset <= 2; offset += 1) {
      remove(x, y + offset, z);
      put(x, y + offset, z, 'window');
    }
    put(x, y + 3, z, 'wall');
  };

  for (const [levelIndex, deckY] of windowLevels.entries()) {
    const referenceColumns = hasReferenceProfile ? (reference?.windowColumns ?? []).map((column) => Math.round(body.x + (column + 1) * (body.width - 2) / 13)) : [];
    const columns = referenceColumns.length ? referenceColumns : Array.from({ length: windowCount }, (_, index) => body.x + Math.round(((index + 1) * body.width) / (windowCount + 1)));
    for (let index = 0; index < columns.length; index += 1) {
      const alongX = columns[index];
      const alongZ = body.z + Math.round(((index + 1) * body.length) / (windowCount + 1));
      if (alongX > body.x && alongX < body.x + body.width - 1 && deckY + 3 <= facadeTop(alongX)) {
        addWindow(alongX, deckY, body.z);
        addWindow(alongX, deckY, body.z + body.length - 1);
      }
      if (alongZ > body.z && alongZ < body.z + body.length - 1 && deckY + 3 <= facadeTop(body.x)) {
        addWindow(body.x, deckY, alongZ);
        addWindow(body.x + body.width - 1, deckY, alongZ);
      }
    }
  }

  const door = plan.components.find((component) => /door|entrance|gate/i.test(`${component.id} ${component.type}`));
  const doorX = Math.round(door?.x ?? body.x + body.width / 2);
  const doorZ = Math.max(body.z, Math.min(body.z + body.length - 1, door?.z ?? body.z));
  const doorFacing = String(door?.options.facing ?? 'south');
  const doorProperties = { facing: doorFacing, hinge: 'left', open: 'false', powered: 'false' };
  for (let y = body.y + 1; y <= body.y + 2; y += 1) remove(doorX, y, doorZ);
  putId(doorX, body.y + 1, doorZ, 'minecraft:dark_oak_door', { ...doorProperties, half: 'lower' });
  putId(doorX, body.y + 2, doorZ, 'minecraft:dark_oak_door', { ...doorProperties, half: 'upper' });

  const buttress = plan.components.find((component) => /buttress|counterfort|support/i.test(`${component.id} ${component.type}`));
  if (buttress) addCornerButtresses(put, body, roofY, numericOption(buttress, 'size', 2));

  const towerLike = /tower|watch|cathedral|castle|palace|keep|fortress|windmill|塔|城堡|教堂|宫殿/i.test(`${plan.type} ${plan.name}`);
  const hasSpire = Boolean(spire || spireRegion);
  if (hasReferenceProfile) {
    addReferenceRoof(put, body, roofY, reference?.silhouette ?? []);
  } else if (towerLike && hasSpire) {
    const roofX = spire?.x ?? spireRegion?.x ?? body.x;
    const roofZ = spire?.z ?? spireRegion?.z ?? body.z;
    const roofWidth = Math.min(width - roofX, Math.max(3, spireRegion?.width ?? numericOption(spire, 'size', Math.min(body.width, body.length))));
    const roofLength = Math.min(length - roofZ, Math.max(3, spireRegion?.length ?? numericOption(spire, 'size', Math.min(body.width, body.length))));
    const roofHeight = Math.max(2, Math.min(height - roofY, spireRegion?.height ?? Math.ceil(Math.min(roofWidth, roofLength) / 2)));
    addSteppedRoof(put, { x: roofX, y: roofY, z: roofZ, width: roofWidth, height: roofHeight, length: roofLength });
  } else if (/flat/i.test(roofComponent?.type ?? '')) {
    addFlatRoof(put, body, roofY);
  } else {
    addGabledRoof(put, body, roofY, Math.max(1, Math.min(height - roofY, Math.ceil(Math.min(body.width, body.length) / 2))));
  }

  const beacon = plan.components.find((component) => /beacon/i.test(`${component.id} ${component.type}`));
  if (beacon) addBeacon(putId, beacon, width, height, length);

  return validateGrid(createGrid([...cells.values()], { width, height, length }, 'user'));
}

export function compareReferenceFrontMask(plan: StructurePlan, cells: Array<{ x: number; y: number; z: number }>): ReferenceMatch | null {
  const features = plan.referenceFeatures;
  if (!features?.frontMask?.length || !features.maskWidth || !features.maskHeight) return null;
  if (!cells.length) return { silhouette: 0, occupied: 0, missing: 1, extra: 0, face: plan.referenceFacing ?? 'z-max', referenceRows: [], generatedRows: [] };
  const faces = [
    { id: 'z-min' as const, cells, horizontal: 'x' as const, reverse: false },
    { id: 'z-max' as const, cells, horizontal: 'x' as const, reverse: true },
    { id: 'x-min' as const, cells, horizontal: 'z' as const, reverse: false },
    { id: 'x-max' as const, cells, horizontal: 'z' as const, reverse: true },
  ];
  const intended = plan.referenceFacing ? faces.filter((face) => face.id === plan.referenceFacing) : faces;
  const matches = intended.filter((face) => face.cells.length).map((face) => compareReferenceFace(plan, face.cells, face.id, face.horizontal, face.reverse));
  return matches.sort((a, b) => b.silhouette - a.silhouette)[0]
    ?? { silhouette: 0, occupied: 0, missing: 1, extra: 0, face: 'z-max', referenceRows: [], generatedRows: [] };
}

function compareReferenceFace(plan: StructurePlan, frontCells: Array<{ x: number; y: number; z: number }>, face: ReferenceMatch['face'], horizontal: 'x' | 'z', reverse: boolean): ReferenceMatch {
  const features = plan.referenceFeatures!;
  let frontMinX = Infinity, frontMinY = Infinity, frontMinZ = Infinity;
  let frontMaxX = -Infinity, frontMaxY = -Infinity, frontMaxZ = -Infinity;
  // Spreading large grids into Math.min/Math.max exceeds the JavaScript argument limit.
  for (const cell of frontCells) {
    frontMinX = Math.min(frontMinX, cell.x); frontMaxX = Math.max(frontMaxX, cell.x);
    frontMinY = Math.min(frontMinY, cell.y); frontMaxY = Math.max(frontMaxY, cell.y);
    frontMinZ = Math.min(frontMinZ, cell.z); frontMaxZ = Math.max(frontMaxZ, cell.z);
  }
  const frontWidth = horizontal === 'x' ? frontMaxX - frontMinX + 1 : frontMaxZ - frontMinZ + 1;
  const frontHeight = frontMaxY - frontMinY + 1;
  const bounds = features.subjectBounds;
  const minColumn = Math.max(0, Math.floor(bounds.left * features.maskWidth));
  const maxColumn = Math.min(features.maskWidth - 1, Math.ceil(bounds.right * features.maskWidth) - 1);
  const minRow = Math.max(0, Math.floor(bounds.top * features.maskHeight));
  const maxRow = Math.min(features.maskHeight - 1, Math.ceil(bounds.bottom * features.maskHeight) - 1);
  if (maxColumn < minColumn || maxRow < minRow) return { silhouette: 0, occupied: 0, missing: 1, extra: 0, face, referenceRows: [], generatedRows: [] };
  const targetWidth = maxColumn - minColumn + 1;
  const targetHeight = maxRow - minRow + 1;
  const pixelsPerBlock = Math.min(targetWidth / frontWidth, targetHeight / frontHeight);
  const fittedWidth = frontWidth * pixelsPerBlock;
  const fittedHeight = frontHeight * pixelsPerBlock;
  const fittedLeft = minColumn + (targetWidth - fittedWidth) / 2;
  const fittedTop = minRow + (targetHeight - fittedHeight) / 2;
  const occupied = new Set<string>();
  for (const cell of frontCells) {
    const coordinate = horizontal === 'x' ? cell.x : cell.z;
    const localX = reverse
      ? (horizontal === 'x' ? frontMaxX - coordinate : frontMaxZ - coordinate) / frontWidth
      : (coordinate - (horizontal === 'x' ? frontMinX : frontMinZ)) / frontWidth;
    const localY = (frontMaxY - cell.y) / frontHeight;
    const x0 = Math.max(minColumn, Math.floor(fittedLeft + localX * fittedWidth));
    const x1 = Math.min(maxColumn, Math.ceil(fittedLeft + (localX + 1 / frontWidth) * fittedWidth) - 1);
    const y0 = Math.max(minRow, Math.floor(fittedTop + localY * fittedHeight));
    const y1 = Math.min(maxRow, Math.ceil(fittedTop + (localY + 1 / frontHeight) * fittedHeight) - 1);
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) occupied.add(`${x},${y}`);
  }
  let intersection = 0;
  let referenceCount = 0;
  let generatedCount = 0;
  const referenceRows = Array.from({ length: features.maskHeight }, () => '');
  const generatedRows = Array.from({ length: features.maskHeight }, () => '');
  for (let row = 0; row < features.maskHeight; row += 1) {
    for (let column = 0; column < features.maskWidth; column += 1) {
      if (column < minColumn || column > maxColumn || row < minRow || row > maxRow) continue;
      const expected = features.frontMask[row * features.maskWidth + column] === 1;
      const actual = occupied.has(`${column},${row}`);
      if (expected) referenceCount += 1;
      if (actual) generatedCount += 1;
      if (expected && actual) intersection += 1;
      referenceRows[row] += expected ? '#' : '.';
      generatedRows[row] += actual ? '#' : '.';
    }
  }
  const union = referenceCount + generatedCount - intersection;
  if (referenceCount === 0) return { silhouette: 0, occupied: 0, missing: 1, extra: 0, face, referenceRows: [], generatedRows: [] };
  const assessedCells = Math.max(1, (maxColumn - minColumn + 1) * (maxRow - minRow + 1));
  return {
    silhouette: union ? intersection / union : 0,
    occupied: generatedCount / Math.max(1, referenceCount),
    missing: Math.max(0, referenceCount - intersection) / Math.max(1, referenceCount),
    extra: Math.max(0, generatedCount - intersection) / assessedCells,
    face,
    generatedYMin: frontMinY,
    generatedYMax: frontMaxY,
    referenceAspectRatio: targetWidth / targetHeight,
    generatedAspectRatio: frontWidth / frontHeight,
    referenceRows: referenceRows.slice(minRow, maxRow + 1),
    generatedRows: generatedRows.slice(minRow, maxRow + 1),
  };
}

function addGeometryParts(
  put: (x: number, y: number, z: number, role: string, properties?: Record<string, string>) => void,
  putId: (x: number, y: number, z: number, id: string, properties?: Record<string, string>) => void,
  parts: GeometryPart[],
  plan: StructurePlan,
): void {
  for (const part of parts) {
    const x0 = Math.max(0, part.x); const y0 = Math.max(0, part.y); const z0 = Math.max(0, part.z);
    const x1 = Math.min(plan.dimensions.width, part.x + part.width); const y1 = Math.min(plan.dimensions.height, part.y + part.height); const z1 = Math.min(plan.dimensions.length, part.z + part.length);
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) continue;
    const material = resolveGeometryMaterial(part.material, plan);
    const putMaterial = (x: number, y: number, z: number) => putId(x, y, z, material);
    const open = new Set(part.openSides ?? []);
    if (part.type === 'cylinder') {
      const cx = (x0 + x1 - 1) / 2; const cz = (z0 + z1 - 1) / 2;
      const rx = Math.max(0.5, (x1 - x0) / 2); const rz = Math.max(0.5, (z1 - z0) / 2);
      const thickness = Math.max(0.08, Math.min(1, (part.thickness ?? 1) / Math.max(1, Math.min(rx, rz))));
      for (let y = y0; y < y1; y += 1) for (let z = z0; z < z1; z += 1) for (let x = x0; x < x1; x += 1) {
        const edge = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
        if (edge <= 1 && (!part.hollow || edge >= (1 - thickness) ** 2)) putMaterial(x, y, z);
      }
      continue;
    }
    if (part.type === 'roof') { addRoofPart(putMaterial, part, x0, y0, z0, x1, y1, z1); continue; }
    if (part.type === 'surface') { addSurfacePart(putMaterial, x0, y0, z0, x1, y1, z1); continue; }
    if (part.type === 'beam') { addBeamPart(putMaterial, part, x0, y0, z0, x1, y1, z1); continue; }
    if (part.type === 'stairs') { addStairPart(putId, part, material, x0, y0, z0, x1, y1, z1); continue; }
    if (part.type === 'arch') { addArchPart(putMaterial, part, x0, y0, z0, x1, y1, z1); continue; }
      addBoxPart(putMaterial, part, open, x0, y0, z0, x1, y1, z1);
  }
}

function addBoxPart(put: (x: number, y: number, z: number) => void, part: GeometryPart, open: Set<string>, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const shell = part.type === 'shell' || Boolean(part.hollow);
  if (!shell && !open.size) {
    for (let y = y0; y < y1; y += 1) for (let z = z0; z < z1; z += 1) for (let x = x0; x < x1; x += 1) put(x, y, z);
    return;
  }
  const thickness = Math.max(1, Math.min(part.thickness ?? 1, Math.floor(Math.min(x1 - x0, y1 - y0, z1 - z0) / 2)));
  const sides = [
    ['west', x0 === 0 ? x0 : x0], ['east', x1 - 1], ['north', z0], ['south', z1 - 1],
  ] as const;
  for (const [side, coordinate] of sides) if (!open.has(side)) {
    if (side === 'west' || side === 'east') for (let y = y0; y < y1; y += 1) for (let z = z0; z < z1; z += 1) put(coordinate, y, z);
    else for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) put(x, y, coordinate);
  }
  const verticalOpen = Math.max(1, open.has('top') ? y1 - y0 - 1 : y1 - y0);
  const bottom = open.has('bottom') ? y0 + 1 : y0;
  if (!open.has('bottom')) for (let z = z0; z < z1; z += 1) for (let x = x0; x < x1; x += 1) put(x, y0, z);
  if (!open.has('top')) for (let z = z0; z < z1; z += 1) for (let x = x0; x < x1; x += 1) put(x, y1 - 1, z);
  if (shell && thickness > 1) {
    for (let layer = 1; layer < thickness; layer += 1) {
      for (let y = y0 + layer; y < y1 - layer; y += 1) {
        if (!open.has('west')) for (let z = z0 + layer; z < z1 - layer; z += 1) put(x0 + layer, y, z);
        if (!open.has('east')) for (let z = z0 + layer; z < z1 - layer; z += 1) put(x1 - 1 - layer, y, z);
        if (!open.has('north')) for (let x = x0 + layer; x < x1 - layer; x += 1) put(x, y, z0 + layer);
        if (!open.has('south')) for (let x = x0 + layer; x < x1 - layer; x += 1) put(x, y, z1 - 1 - layer);
      }
    }
  }
}

function addSurfacePart(put: (x: number, y: number, z: number) => void, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const thickness = Math.max(1, Math.min(y1 - y0, 2));
  for (let y = y0; y < Math.min(y1, y0 + thickness); y += 1) for (let z = z0; z < z1; z += 1) for (let x = x0; x < x1; x += 1) put(x, y, z);
}

function addBeamPart(put: (x: number, y: number, z: number) => void, part: GeometryPart, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const horizontalX = part.width >= part.length;
  if (horizontalX) for (let x = x0; x < x1; x += 1) for (let dy = 0; dy < Math.min(part.height, 2); dy += 1) put(x, y0 + dy, z0);
  else for (let z = z0; z < z1; z += 1) for (let dy = 0; dy < Math.min(part.height, 2); dy += 1) put(x0, y0 + dy, z);
}

function addStairPart(put: (x: number, y: number, z: number, id: string, properties?: Record<string, string>) => void, part: GeometryPart, material: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const stairId = material.includes('oak') ? 'minecraft:oak_stairs' : 'minecraft:stone_brick_stairs';
  const facing = part.facing ?? 'south';
  const alongZ = facing === 'north' || facing === 'south';
  const run = alongZ ? z1 - z0 : x1 - x0;
  for (let step = 0; step < run; step += 1) {
    const y = y0 + Math.min(y1 - y0 - 1, step);
    const xStart = alongZ ? x0 : x0 + step;
    const xEnd = alongZ ? x1 : Math.min(x1, xStart + 1);
    const zStart = alongZ ? (facing === 'north' ? z1 - 1 - step : z0 + step) : z0;
    const zEnd = alongZ ? zStart + 1 : z1;
    for (let x = xStart; x < xEnd; x += 1) put(x, y, zStart, stairId, { facing, half: 'bottom', shape: 'straight', waterlogged: 'false' });
    for (let z = zStart + 1; z < zEnd; z += 1) for (let x = xStart; x < xEnd; x += 1) put(x, y, z, material);
  }
}

function addArchPart(put: (x: number, y: number, z: number) => void, part: GeometryPart, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const cx = (x0 + x1 - 1) / 2; const baseY = y0 + Math.floor((y1 - y0) * 0.42); const rx = Math.max(1, (x1 - x0) / 2); const ry = Math.max(1, y1 - baseY);
  const thickness = Math.max(1, part.thickness ?? 1);
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    const outer = ((x - cx) / rx) ** 2 + ((y - baseY) / ry) ** 2;
    const inner = ((x - cx) / Math.max(1, rx - thickness)) ** 2 + ((y - baseY) / Math.max(1, ry - thickness)) ** 2;
    const leg = y < baseY && (x <= x0 + thickness - 1 || x >= x1 - thickness);
    if ((outer <= 1 && outer >= 0.6) || leg) for (let z = z0; z < Math.min(z1, z0 + thickness); z += 1) put(x, y, z);
  }
}

function addRoofPart(put: (x: number, y: number, z: number) => void, part: GeometryPart, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const style = part.roofStyle ?? 'hip';
  const rise = Math.max(1, y1 - y0);
  const span = part.ridgeAxis === 'z' ? x1 - x0 : z1 - z0;
  for (let y = y0; y < y1; y += 1) {
    const layer = y1 - 1 - y;
    const inset = style === 'gable' ? Math.floor(Math.abs(layer - (rise - 1) / 2) * span / Math.max(1, rise)) : style === 'mansard' ? Math.ceil(layer / 2) : layer;
    const minX = x0 + inset; const maxX = x1 - inset; const minZ = z0 + inset; const maxZ = z1 - inset;
    if (minX >= maxX || minZ >= maxZ) continue;
    for (let z = minZ; z < maxZ; z += 1) for (let x = minX; x < maxX; x += 1) put(x, y, z);
  }
}

function resolveGeometryMaterial(value: string, plan: StructurePlan): string {
  const role = value as keyof typeof plan.palette;
  if (plan.palette?.[role]) return plan.palette[role];
  return value.includes(':') ? value : `minecraft:${value || 'stone_bricks'}`;
}

function addVisionRegions(
  put: (x: number, y: number, z: number, role: string, properties?: Record<string, string>) => void,
  putId: (x: number, y: number, z: number, id: string, properties?: Record<string, string>) => void,
  remove: (x: number, y: number, z: number) => void,
  plan: StructurePlan,
): void {
  const ordered = [...plan.regions].sort((left, right) => left.y - right.y || right.width * right.length - left.width * left.length);
  for (const region of ordered) {
    const label = `${region.name} ${region.role}`.toLowerCase();
    if (/unassigned|background|ground|base plane/.test(label)) {
      for (let z = region.z; z < region.z + region.length; z += 1) for (let x = region.x; x < region.x + region.width; x += 1) put(x, region.y, z, 'floor');
      continue;
    }
    if (/roof|spire|dome|top|cap/.test(label)) {
      addSteppedRoof(put, { x: region.x, y: region.y, z: region.z, width: region.width, height: region.height, length: region.length });
      addVisionRoofStairs(putId, region);
      continue;
    }
    const isTower = /tower|turret|column|chimney/.test(label);
    const isChest = /chest|body|torso|hall|main/.test(label);
    const isOpenRegion = /open|path|walkway|window|canopy|lantern row|rear|backpack|mechanic/.test(label);
    const shellInset = isTower ? 0 : 1;
    const profile = plan.referenceFeatures?.silhouette ?? [];
    for (let y = region.y; y < region.y + region.height; y += 1) {
      const localY = y - region.y;
      const taper = isTower ? Math.floor(localY / 5) : Math.floor(localY / Math.max(3, region.height / 4));
      const minX = region.x + Math.min(shellInset + taper, Math.floor((region.width - 1) / 2));
      const maxX = region.x + region.width - 1 - Math.min(shellInset + taper, Math.floor((region.width - 1) / 2));
      const minZ = region.z + shellInset;
      const maxZ = region.z + region.length - 1 - shellInset;
      if (minX > maxX || minZ > maxZ) continue;
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const boundary = x === minX || x === maxX || z === minZ || z === maxZ || localY === 0 || localY === region.height - 1;
          if (boundary) put(x, y, z, localY === region.height - 1 && !isChest ? 'roof' : 'wall');
          else if (!isOpenRegion) put(x, y, z, /roof|eave|band|pavilion|platform|finial/.test(label) ? 'roof' : 'wall');
          else if (/floor|deck|slab|level/.test(label) && localY % 4 === 0) put(x, y, z, 'floor');
        }
      }
      if (isChest && profile.length > 0 && localY > 0 && localY < region.height - 1 && localY % 2 === 1) {
        const columns = profile.map((top, index) => ({ top, index })).filter(({ top }) => top < 0.78);
        for (const { index } of columns) {
          const x = minX + Math.round((index / Math.max(1, profile.length - 1)) * Math.max(0, maxX - minX));
          if (x > minX && x < maxX) {
            remove(x, y, minZ);
            put(x, y, minZ, 'window');
          }
        }
      }
    }
    if (isChest && region.width >= 5 && region.length >= 3) {
      const panelX = region.x + Math.floor(region.width / 2);
      const panelY = region.y + Math.max(1, Math.floor(region.height / 2));
      const panelZ = region.z;
      putId(panelX, panelY, panelZ, 'minecraft:glowstone');
      if (panelX + 1 < region.x + region.width) putId(panelX + 1, panelY, panelZ, 'minecraft:glowstone');
    }
    addVisionEntrySteps(putId, region);
  }
  addVisionComponents(putId, plan);
  const door = plan.components.find((component) => /door|entrance|gate/i.test(`${component.id} ${component.type}`));
  if (door) {
    const region = ordered.find((candidate) => door.x >= candidate.x && door.x < candidate.x + candidate.width && door.z >= candidate.z && door.z < candidate.z + candidate.length);
    const x = Math.max(0, Math.min(plan.dimensions.width - 1, door.x));
    const z = Math.max(0, Math.min(plan.dimensions.length - 1, door.z));
    const y = Math.max(0, Math.min(plan.dimensions.height - 2, door.y));
    if (region) {
      remove(x, y, z);
      remove(x, y + 1, z);
      putId(x, y, z, 'minecraft:iron_door', { facing: String(door.options.facing ?? 'south'), hinge: 'left', open: 'false', powered: 'false', half: 'lower' });
      putId(x, y + 1, z, 'minecraft:iron_door', { facing: String(door.options.facing ?? 'south'), hinge: 'left', open: 'false', powered: 'false', half: 'upper' });
    }
  }
}

function addVisionComponents(putId: (x: number, y: number, z: number, id: string, properties?: Record<string, string>) => void, plan: StructurePlan): void {
  const windowId = plan.palette.window;
  const roofId = plan.palette.roof;
  for (const component of plan.components) {
    const label = `${component.id} ${component.type}`.toLowerCase();
    const count = Math.max(1, Math.min(16, numericOption(component, 'count', 1)));
    const facing = String(component.options.facing ?? 'south');
    if (/window|glass|opening/.test(label)) {
      for (let index = 0; index < count; index += 1) putId(component.x + index, component.y, component.z, windowId, { facing: facing === 'north' ? 'north' : 'south', waterlogged: 'false' });
      continue;
    }
    if (/stair|step|ladder/.test(label)) {
      for (let index = 0; index < count; index += 1) putId(component.x, component.y + index, component.z + index, 'minecraft:stone_brick_stairs', { facing, half: 'bottom', shape: 'straight', waterlogged: 'false' });
      continue;
    }
    if (/roof|eave|awning|finial/.test(label)) {
      for (let index = 0; index < count; index += 1) putId(component.x + index, component.y, component.z, roofId.includes('stairs') ? roofId : 'minecraft:dark_oak_stairs', { facing, half: 'bottom', shape: 'straight', waterlogged: 'false' });
      continue;
    }
    if (/lantern|light|lamp/.test(label)) {
      putId(component.x, component.y, component.z, 'minecraft:lantern', { hanging: String(component.options.hanging ?? 'false'), waterlogged: 'false' });
    }
  }
}

function addVisionEntrySteps(putId: (x: number, y: number, z: number, id: string, properties?: Record<string, string>) => void, region: StructureRegionPlan): void {
  if (region.width < 3 || region.length < 4) return;
  const x = region.x + Math.floor(region.width / 2);
  const count = Math.min(3, region.length - 1);
  for (let step = 0; step < count; step += 1) {
    putId(x, region.y + Math.min(step, Math.max(0, region.height - 1)), region.z - step, 'minecraft:stone_brick_stairs', { facing: 'south', half: 'bottom', shape: 'straight', waterlogged: 'false' });
  }
}

function addVisionRoofStairs(putId: (x: number, y: number, z: number, id: string, properties?: Record<string, string>) => void, region: StructureRegionPlan): void {
  if (region.width < 3 || region.length < 3) return;
  const y = region.y + Math.max(0, region.height - 1);
  for (let x = region.x + 1; x < region.x + region.width - 1; x += 1) {
    putId(x, y, region.z, 'minecraft:dark_oak_stairs', { facing: 'south', half: 'bottom', shape: 'straight', waterlogged: 'false' });
    putId(x, y, region.z + region.length - 1, 'minecraft:dark_oak_stairs', { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' });
  }
}

function addReferenceRoof(put: (x: number, y: number, z: number, role: string) => void, body: BuildingBounds, roofY: number, silhouette: number[]): void {
  for (let x = body.x; x < body.x + body.width; x += 1) {
    const sampleIndex = Math.max(0, Math.min(silhouette.length - 1, Math.round((x - body.x) / Math.max(1, body.width - 1) * (silhouette.length - 1))));
    const rise = Math.max(1, Math.min(8, Math.round((1 - silhouette[sampleIndex]) * Math.min(body.width, body.length) / 3)));
    for (let y = 0; y < rise; y += 1) {
      const zInset = Math.min(y, Math.floor((body.length - 1) / 2));
      for (let z = body.z + zInset; z < body.z + body.length - zInset; z += 1) put(x, roofY + y, z, 'roof');
    }
  }
}

type BuildingBounds = { x: number; y: number; z: number; width: number; height: number; length: number };

function mainBuildingBounds(plan: StructurePlan): BuildingBounds {
  const preferred = plan.regions.filter((region) => /main|body|tower|shaft|hall|keep|structure|塔身|主体|主塔/i.test(`${region.name} ${region.role}`));
  const candidates = preferred.length ? preferred : plan.regions;
  const main = [...candidates].sort((left, right) => right.width * right.height * right.length - left.width * left.height * left.length)[0];
  return {
    x: main.x,
    y: main.y,
    z: main.z,
    width: main.width,
    height: main.height,
    length: main.length,
  };
}

function addCornerButtresses(put: (x: number, y: number, z: number, role: string) => void, body: BuildingBounds, top: number, requestedSize: number): void {
  const size = Math.max(2, Math.min(4, requestedSize));
  const corners = [
    [body.x, body.z],
    [body.x + body.width - size, body.z],
    [body.x, body.z + body.length - size],
    [body.x + body.width - size, body.z + body.length - size],
  ] as const;
  for (const [x, z] of corners) {
    for (let y = body.y; y < top; y += 1) {
      const inset = y > body.y && y % 4 === 0 ? 1 : 0;
      for (let dz = inset; dz < size - inset; dz += 1) {
        for (let dx = inset; dx < size - inset; dx += 1) {
          if (dx === inset || dz === inset || dx === size - inset - 1 || dz === size - inset - 1) put(x + dx, y, z + dz, 'wall');
        }
      }
    }
  }
}

function addSteppedRoof(put: (x: number, y: number, z: number, role: string) => void, roof: BuildingBounds): void {
  for (let y = 0; y < roof.height; y += 1) {
    const inset = Math.floor(y / 2);
    const minX = inset;
    const maxX = roof.width - inset - 1;
    const minZ = inset;
    const maxZ = roof.length - inset - 1;
    if (minX > maxX || minZ > maxZ) break;
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) put(roof.x + x, roof.y + y, roof.z + z, 'roof');
    }
  }
}

function addFlatRoof(put: (x: number, y: number, z: number, role: string) => void, body: BuildingBounds, y: number): void {
  for (let z = body.z; z < body.z + body.length; z += 1) {
    for (let x = body.x; x < body.x + body.width; x += 1) put(x, y, z, 'roof');
  }
}

function addGabledRoof(put: (x: number, y: number, z: number, role: string) => void, body: BuildingBounds, y: number, requestedRise: number): void {
  const ridgeAlongX = body.width >= body.length;
  const span = ridgeAlongX ? body.length : body.width;
  const rise = Math.max(1, Math.min(requestedRise, Math.floor((span + 1) / 2)));
  for (let layer = 0; layer < rise; layer += 1) {
    const inset = Math.min(layer, Math.floor((span - 1) / 2));
    if (ridgeAlongX) {
      for (let z = body.z + inset; z < body.z + body.length - inset; z += 1) {
        for (let x = body.x; x < body.x + body.width; x += 1) put(x, y + layer, z, 'roof');
      }
      continue;
    }
    for (let x = body.x + inset; x < body.x + body.width - inset; x += 1) {
      for (let z = body.z; z < body.z + body.length; z += 1) put(x, y + layer, z, 'roof');
    }
  }
}

function addBeacon(putId: (x: number, y: number, z: number, id: string) => void, component: ComponentPlan, width: number, height: number, length: number): void {
  const x = Math.max(1, Math.min(width - 2, component.x));
  const z = Math.max(1, Math.min(length - 2, component.z));
  const y = Math.max(1, Math.min(height - 1, component.y));
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) putId(x + dx, y - 1, z + dz, 'minecraft:redstone_block');
  }
  putId(x, y, z, 'minecraft:beacon');
}

function numericOption(component: ComponentPlan | undefined, name: string, fallback: number): number {
  const value = Number(component?.options?.[name]);
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function paletteFor(style: string): Record<string, string> {
  if (style === 'modern') return { wall: 'minecraft:quartz_block', roof: 'minecraft:gray_concrete', floor: 'minecraft:smooth_stone', window: 'minecraft:glass' };
  if (style === 'desert') return { wall: 'minecraft:sandstone', roof: 'minecraft:cut_sandstone', floor: 'minecraft:smooth_sandstone', window: 'minecraft:glass' };
  if (style === 'gothic') return { wall: 'minecraft:deepslate_bricks', roof: 'minecraft:deepslate_tiles', floor: 'minecraft:polished_deepslate', window: 'minecraft:purple_stained_glass' };
  return { wall: 'minecraft:stone_bricks', roof: 'minecraft:dark_oak_planks', floor: 'minecraft:oak_planks', window: 'minecraft:glass_pane' };
}

function findKeyword(text: string, keywords: Array<[string, string]>): string | undefined { return keywords.find(([keyword]) => text.includes(keyword))?.[1]; }
function containsAny(text: string, keywords: string[]): boolean { return keywords.some((keyword) => text.includes(keyword)); }
function parseNumber(text: string, pattern: RegExp, fallback: number): number { const match = pattern.exec(text); return match ? Number(match[1]) : fallback; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.floor(value) : min)); }

export * from './vision.js';
