import { validateGrid, type BlockGrid, type BlockState } from '@craftaib/core';

type StructureOptions = Record<string, unknown> & { type?: string; floors?: number; style?: string; seed?: number };
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
  const moduleUrl = new URL('../../../vendor/craftmatic/dist/gen/generator.js', import.meta.url).href;
  const loader = new Function('url', 'return import(url)') as (url: string) => Promise<{ generateStructure(options: StructureOptions): CraftmaticGrid }>;
  const module = await loader(moduleUrl);
  return toCoreGrid(module.generateStructure({ type: 'house', floors: 2, style: 'fantasy', ...options }));
}
