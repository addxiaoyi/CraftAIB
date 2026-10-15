import { createGrid, validateGrid, type BlockGrid, type BlockState } from '@craftaib/core';

export type StructureOptions = Record<string, unknown> & { type?: string; floors?: number; style?: string; seed?: number };
type CraftmaticGrid = { width: number; height: number; length: number; rawData: Uint16Array; reversePalette(): string[] };

function parseState(value: string): BlockState {
  const match = /^([^[]+)(?:\[(.*)\])?$/.exec(value);
  if (!match) throw new Error(`Invalid Craftmatic block state: ${value}`);
  const properties: Record<string, string> = {};
  for (const pair of (match[2] ?? '').split(',').filter(Boolean)) {
    const [key, property] = pair.split('=', 2);
    if (key && property) properties[key] = property;
  }
  return Object.keys(properties).length ? { id: match[1], properties } : { id: match[1] };
}

function toCoreGrid(source: CraftmaticGrid): BlockGrid {
  const palette = source.reversePalette().map(parseState);
  const cells: BlockGrid['cells'] = [];
  for (let y = 0; y < source.height; y += 1) {
    for (let z = 0; z < source.length; z += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const index = (y * source.length + z) * source.width + x;
        const block = palette[source.rawData[index]];
        if (!block || block.id === 'minecraft:air') continue;
        cells.push({ x, y, z, block, source: 'craftmatic' });
      }
    }
  }
  return validateGrid({ version: 1, width: source.width, height: source.height, length: source.length, cells, palette, coordinateSystem: 'xyz', origin: { x: 0, y: 0, z: 0 } });
}

export async function generateStructure(options: StructureOptions): Promise<BlockGrid> {
  const runtime = globalThis as typeof globalThis & { process?: { versions?: { node?: string } } };
  if (!runtime.process?.versions?.node) return generateBrowserStructure(options);
  const moduleUrl = new URL('../../../vendor/craftmatic/dist/gen/generator.js', import.meta.url).href;
  const loader = new Function('url', 'return import(url)') as (url: string) => Promise<{ generateStructure(options: StructureOptions): CraftmaticGrid }>;
  const module = await loader(moduleUrl);
  return toCoreGrid(module.generateStructure({ type: 'house', floors: 2, style: 'fantasy', ...options }));
}

export function generateBrowserStructure(options: StructureOptions): BlockGrid {
  const type = options.type ?? 'house';
  const floors = Math.max(1, Math.min(12, Math.floor(Number(options.floors ?? 2))));
  const width = Math.max(8, Math.min(256, Math.floor(Number(options.width ?? 24))));
  const length = Math.max(8, Math.min(256, Math.floor(Number(options.length ?? 24))));
  const height = Math.max(5, floors * 4 + 2);
  const wall = browserBlock(options.style, 'wall');
  const roof = browserBlock(options.style, 'roof');
  const cells = new Map<string, BlockGrid['cells'][number]>();
  const put = (x: number, y: number, z: number, id: string) => {
    if (x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < length) cells.set(`${x},${y},${z}`, { x, y, z, block: { id }, source: 'craftmatic' });
  };
  const shell = type === 'tower' ? Math.max(5, Math.min(width, length, 12)) : Math.min(width, length);
  const x0 = Math.floor((width - shell) / 2); const z0 = Math.floor((length - shell) / 2);
  for (let y = 0; y < height; y += 1) for (let z = z0; z < z0 + shell; z += 1) for (let x = x0; x < x0 + shell; x += 1) {
    if (y === 0 || y % 4 === 0) put(x, y, z, y === 0 ? wall : roof);
    else if (x === x0 || x === x0 + shell - 1 || z === z0 || z === z0 + shell - 1) put(x, y, z, wall);
  }
  for (let floor = 0; floor < floors; floor += 1) {
    const y = floor * 4 + 2;
    for (let x = x0 + 2; x < x0 + shell - 2; x += 3) { put(x, y, z0, 'minecraft:glass_pane'); put(x, y, z0 + shell - 1, 'minecraft:glass_pane'); }
    for (let z = z0 + 2; z < z0 + shell - 2; z += 3) { put(x0, y, z, 'minecraft:glass_pane'); put(x0 + shell - 1, y, z, 'minecraft:glass_pane'); }
  }
  if (type === 'bridge') for (let x = 0; x < width; x += 1) { put(x, 0, Math.floor(length / 2), wall); put(x, 1, Math.floor(length / 2), roof); }
  if (type === 'ship') for (let x = 2; x < width - 2; x += 1) for (let z = 2; z < length - 2; z += 1) if (Math.abs(z - length / 2) < Math.max(2, (width - x) / 4)) put(x, 0, z, wall);
  if (type === 'castle') {
    const tower = Math.max(3, Math.min(6, Math.floor(shell / 4)));
    for (const [tx, tz] of [[x0, z0], [x0 + shell - tower, z0], [x0, z0 + shell - tower], [x0 + shell - tower, z0 + shell - tower]]) for (let y = 0; y < height + 2 && y < height; y += 1) for (let z = tz; z < tz + tower; z += 1) for (let x = tx; x < tx + tower; x += 1) if (y === 0 || x === tx || x === tx + tower - 1 || z === tz || z === tz + tower - 1 || y === height - 1) put(x, y, z, y === height - 1 ? roof : wall);
  }
  if (type === 'cathedral') {
    for (let y = 1; y < height; y += 1) { put(x0 + Math.floor(shell / 2), y, z0 + 1, wall); put(x0 + Math.floor(shell / 2), y, z0 + shell - 2, wall); }
    for (let z = z0 + 2; z < z0 + shell - 2; z += 2) put(x0 + Math.floor(shell / 2), height - 1, z, roof);
  }
  if (type === 'dungeon') {
    for (let x = x0 + 2; x < x0 + shell - 2; x += 1) for (let z = z0 + 2; z < z0 + shell - 2; z += 1) put(x, 0, z, 'minecraft:deepslate');
    for (let x = x0 + 1; x < x0 + shell - 1; x += 2) put(x, 1, z0 + 1, 'minecraft:iron_bars');
  }
  if (type === 'windmill') {
    const cx = Math.floor(width / 2); const cz = Math.floor(length / 2);
    for (let y = 0; y < height; y += 1) { put(cx, y, cz, wall); put(cx - 1, y, cz, wall); put(cx + 1, y, cz, wall); }
    for (let d = 1; d < Math.min(width, length) / 3; d += 1) { put(cx + d, Math.floor(height / 2), cz, roof); put(cx - d, Math.floor(height / 2), cz, roof); put(cx, Math.floor(height / 2), cz + d, roof); put(cx, Math.floor(height / 2), cz - d, roof); }
  }
  if (type === 'marketplace' || type === 'village') {
    const size = Math.max(4, Math.floor(shell / 3));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const bx = Math.floor(width / 2) + dx * (size + 1); const bz = Math.floor(length / 2) + dz * (size + 1); for (let y = 0; y < Math.min(height, 6); y += 1) for (let z = 0; z < size; z += 1) for (let x = 0; x < size; x += 1) if (y === 0 || x === 0 || z === 0 || x === size - 1 || z === size - 1) put(bx + x - Math.floor(size / 2), y, bz + z - Math.floor(size / 2), wall); }
  }
  return createGrid([...cells.values()], { width, height, length }, 'craftmatic');
}
function browserBlock(style: unknown, role: 'wall' | 'roof'): string {
  if (role === 'roof') return style === 'modern' ? 'minecraft:light_gray_concrete' : style === 'desert' ? 'minecraft:sandstone' : 'minecraft:dark_oak_planks';
  if (style === 'modern') return 'minecraft:quartz_block';
  if (style === 'desert') return 'minecraft:sandstone';
  if (style === 'underwater') return 'minecraft:prismarine_bricks';
  if (style === 'gothic') return 'minecraft:deepslate_bricks';
  return 'minecraft:stone_bricks';
}
