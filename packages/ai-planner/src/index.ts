import { createGrid, validateGrid, type BlockGrid } from '../../core/dist/index.js';

export type BuildingPrompt = {
  prompt: string;
  seed?: number;
  model?: string;
  referenceImage?: {
    width: number;
    height: number;
    pixels?: Uint8Array | number[];
    sourceName?: string;
    url?: string;
    dataUrl?: string;
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
  inference?: { source: 'prompt' | 'reference-heuristic' | 'vision-model'; detectedType?: string; detectedStyle?: string; confidence?: number };
};

const BUILDING_TYPES = ['house', 'tower', 'castle', 'dungeon', 'ship', 'cathedral', 'bridge', 'windmill', 'marketplace', 'village', 'city', 'harbor', 'palace', 'industrial'] as const;
const STYLES = ['fantasy', 'medieval', 'modern', 'gothic', 'rustic', 'steampunk', 'elven', 'desert', 'underwater', 'colonial'] as const;

export function planBuilding(input: BuildingPrompt): StructurePlan {
  const prompt = input.prompt?.trim();
  if (!prompt) throw new Error('Building prompt is required.');

  const text = prompt.toLowerCase();
  const type = findKeyword(text, [
    ['city', 'city'], ['harbor', 'harbor'], ['palace', 'palace'], ['industrial', 'industrial'],
    ['castle', 'castle'], ['城堡', 'castle'], ['tower', 'tower'], ['塔楼', 'tower'], ['塔', 'tower'],
    ['cathedral', 'cathedral'], ['教堂', 'cathedral'], ['village', 'village'], ['村庄', 'village'],
    ['村', 'village'], ['ship', 'ship'], ['船', 'ship'], ['bridge', 'bridge'], ['桥', 'bridge'],
    ['windmill', 'windmill'], ['风车', 'windmill'], ['dungeon', 'dungeon'], ['地牢', 'dungeon'],
    ['city', 'city'], ['harbor', 'harbor'], ['palace', 'palace'], ['industrial', 'industrial'],
  ]) as StructurePlan['type'] ?? 'house';
  const style = findKeyword(text, [
    ['modern', 'modern'], ['现代', 'modern'], ['gothic', 'gothic'], ['哥特', 'gothic'],
    ['desert', 'desert'], ['沙漠', 'desert'], ['medieval', 'medieval'], ['中世纪', 'medieval'],
    ['steampunk', 'steampunk'], ['蒸汽朋克', 'steampunk'], ['elven', 'elven'], ['精灵', 'elven'],
    ['underwater', 'underwater'], ['水下', 'underwater'], ['rustic', 'rustic'], ['乡村', 'rustic'],
  ]) as StructurePlan['style'] ?? 'fantasy';
  const floors = clamp(parseNumber(text, /(?:floors?|层数?|层)\s*[:：]?\s*(\d+)/, 2), 1, 12);
  const width = clamp(parseNumber(text, /(?:width|宽度|宽)\s*[:：]?\s*(\d+)/, type === 'tower' ? 14 : 24), 8, 256);
  const length = clamp(parseNumber(text, /(?:length|深度|长度|长)\s*[:：]?\s*(\d+)/, width), 8, 256);
  const height = floors * 4 + 2;
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

  return {
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
}

export function planBuildingFromReference(input: BuildingPrompt): StructurePlan {
  if (!input.referenceImage) throw new Error('A reference image is required.');
  const image = input.referenceImage;
  const aspect = image.width / Math.max(1, image.height);
  const pixels = image.pixels instanceof Uint8Array ? image.pixels : image.pixels ? Uint8Array.from(image.pixels) : new Uint8Array();
  let brightness = 0;
  for (let index = 0; index + 2 < pixels.length; index += 4) brightness += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
  brightness /= Math.max(1, Math.floor(pixels.length / 4));
  const base = planBuilding({ ...input, prompt: input.prompt || 'house' });
  const type = aspect < 0.72 ? 'tower' : aspect > 1.45 ? 'castle' : base.type;
  const style = brightness < 85 ? 'gothic' : brightness > 190 ? 'modern' : base.style;
  const floors = clamp(Math.round(image.height / Math.max(1, image.width) * 8), 1, 8);
  const width = clamp(Math.round(16 + image.width / 32), 12, 64);
  const length = clamp(Math.round(width / Math.max(0.65, Math.min(1.6, aspect))), 12, 64);
  return { ...planBuilding({ prompt: `${style} ${type} floors ${floors} width ${width} length ${length}`, seed: input.seed, referenceImage: image }), inference: { source: 'reference-heuristic', detectedType: type, detectedStyle: style, confidence: 0.35 } };
}

export function validateStructurePlan(plan: StructurePlan): StructurePlan {
  if (!plan || plan.version !== 1) throw new Error('Unsupported StructurePlan version.');
  const { width, height, length } = plan.dimensions;
  for (const value of [width, height, length, plan.floors]) if (!Number.isInteger(value) || value < 1) throw new Error('StructurePlan dimensions and floors must be positive integers.');
  if (!Array.isArray(plan.regions) || plan.regions.length === 0) throw new Error('StructurePlan must contain at least one named region.');
  const names = new Set<string>();
  for (const region of plan.regions) {
    if (!region.name?.trim() || names.has(region.name)) throw new Error(`StructurePlan has a duplicate or empty region name: ${region.name}`);
    names.add(region.name);
    if (![region.x, region.y, region.z, region.width, region.height, region.length].every(Number.isInteger)) throw new Error(`Region '${region.name}' has non-integer bounds.`);
    if (region.width < 1 || region.height < 1 || region.length < 1 || region.x < 0 || region.y < 0 || region.z < 0 || region.x + region.width > width || region.y + region.height > height || region.z + region.length > length) throw new Error(`Region '${region.name}' is outside the StructurePlan dimensions.`);
  }
  for (const room of plan.rooms ?? []) if (room.x < 0 || room.y < 0 || room.z < 0 || room.x + room.width > width || room.y + room.height > height || room.z + room.length > length) throw new Error(`Room '${room.id}' is outside the StructurePlan dimensions.`);
  if (!plan.palette?.wall || !plan.palette?.floor || !plan.palette?.roof || !plan.palette?.window) throw new Error('StructurePlan palette must define wall, floor, roof, and window blocks.');
  return plan;
}

export function createLitematicaPlannerInstruction(): string {
  return 'Return JSON StructurePlan version 1. Treat Litematica as a named multi-region schematic format. When a reference image is supplied, follow it as the primary source: reconstruct visible silhouette, proportions, floors, roof geometry, windows, towers, courtyards, facade rhythm, materials, and distinctive landmarks. Do not invent a generic preset when the image contradicts it. Keep xyz coordinates, positive integer dimensions, non-overflowing named regions, block states with properties, palette roles wall/floor/roof/window, rooms, components, seed, notes, and inference source/confidence. Regions are local sub-volumes with x/y/z and width/height/length; do not return a flat image or only a material list. The result must be suitable for BlockGrid conversion and Litematic export.';
}

export type PlannedRegionGrid = {
  name: string;
  grid: BlockGrid;
  position: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
};

export function structurePlanToRegionGrids(plan: StructurePlan): PlannedRegionGrid[] {
  validateStructurePlan(plan);
  const whole = structurePlanToGrid(plan);
  const cellsByRegion = plan.regions.map(() => [] as BlockGrid['cells']);
  for (const cell of whole.cells) {
    for (let index = plan.regions.length - 1; index >= 0; index -= 1) {
      const region = plan.regions[index];
      const contains = cell.x >= region.x && cell.x < region.x + region.width && cell.y >= region.y && cell.y < region.y + region.height && cell.z >= region.z && cell.z < region.z + region.length;
      if (!contains) continue;
      cellsByRegion[index].push({ ...cell, x: cell.x - region.x, y: cell.y - region.y, z: cell.z - region.z });
      break;
    }
  }
  return plan.regions.map((region, index) => ({ name: region.name, grid: createGrid(cellsByRegion[index], { width: region.width, height: region.height, length: region.length }, 'user'), position: { x: region.x, y: region.y, z: region.z }, size: { x: region.width, y: region.height, z: region.length } }));
}

export function structurePlanToGrid(plan: StructurePlan): BlockGrid {
  validateStructurePlan(plan);
  const { width, height, length } = plan.dimensions;
  const cells = new Map<string, BlockGrid['cells'][number]>();
  const put = (x: number, y: number, z: number, role: string) => {
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= length) return;
    const block = plan.palette[role] ?? plan.palette.wall;
    cells.set(`${x},${y},${z}`, { x, y, z, block: { id: block }, source: 'user' });
  };

  for (let y = 0; y < height; y += 1) {
    for (let z = 0; z < length; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const edge = x === 0 || z === 0 || x === width - 1 || z === length - 1;
        if (y === 0) put(x, y, z, 'floor');
        else if (edge && (y % 4 !== 3 || y === height - 1)) put(x, y, z, 'wall');
      }
    }
  }
  for (let floor = 0; floor < plan.floors; floor += 1) {
    const y = floor * 4 + 2;
    for (let x = 3; x < width - 3; x += 3) { put(x, y, 0, 'window'); put(x, y, length - 1, 'window'); }
    for (let z = 3; z < length - 3; z += 3) { put(0, y, z, 'window'); put(width - 1, y, z, 'window'); }
  }
  for (let y = height - 2; y < height; y += 1) {
    for (let z = 0; z < length; z += 1) for (let x = 0; x < width; x += 1) if (x === 0 || z === 0 || x === width - 1 || z === length - 1 || y === height - 1) put(x, y, z, 'roof');
  }
  const door = plan.components.find((component) => component.type === 'door');
  if (door) for (let y = 1; y < 3; y += 1) cells.delete(`${door.x},${y},${door.z}`);
  return validateGrid(createGrid([...cells.values()], { width, height, length }, 'user'));
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
