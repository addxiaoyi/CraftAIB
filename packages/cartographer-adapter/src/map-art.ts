import { createGrid, type BlockGrid, type PixelMap, type BlockState } from '@craftaib/core';

export type MapPaletteEntry = { block: BlockState; color: { r: number; g: number; b: number }; maxCount?: number };
export type MapArtGenerateOptions = { palette: MapPaletteEntry[]; staircasing?: 'none' | 'continuous' | 'baseline' | 'boundary'; supportBlock?: BlockState; dither?: boolean; source?: 'cartographer' };

type Cell = { x: number; y: number; z: number; block: BlockState; source: 'cartographer' };

function distance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  const red = a.r - b.r; const green = a.g - b.g; const blue = a.b - b.b;
  return red * red + green * green + blue * blue;
}

function choosePalette(color: PixelMap['pixels'][number], palette: MapPaletteEntry[], counts: Map<string, number>) {
  return palette.reduce((best, candidate) => {
    const used = counts.get(candidate.block.id) ?? 0;
    const exhausted = candidate.maxCount !== undefined && used >= candidate.maxCount;
    if (exhausted) return best;
    if (!best || distance(color, candidate.color) < distance(color, best.color)) return { ...candidate, color: { ...candidate.color } };
    return best;
  }, undefined as (MapPaletteEntry & { color: { r: number; g: number; b: number } }) | undefined);
}

export function generateMapArt(pixelMap: PixelMap, options: MapArtGenerateOptions): BlockGrid {
  if (!pixelMap.width || !pixelMap.height || options.palette.length === 0) throw new Error('Map Art requires a non-empty image and palette.');
  const counts = new Map<string, number>();
  const cells: Cell[] = [];
  const errors = new Array(pixelMap.width * pixelMap.height).fill(null).map(() => ({ r: 0, g: 0, b: 0 }));
  let previousY = 0;
  let lastBoundary = -1;

  for (let x = 0; x < pixelMap.width; x += 1) {
    previousY = 0;
    for (let row = pixelMap.height - 1; row >= 0; row -= 1) {
      const index = row * pixelMap.width + x;
      const source = pixelMap.pixels[index];
      const adjusted = { r: clamp(source.r + errors[index].r), g: clamp(source.g + errors[index].g), b: clamp(source.b + errors[index].b), a: source.a };
      const selected = choosePalette(adjusted, options.palette, counts);
      if (!selected) throw new Error('Map Art palette capacity is insufficient for this image.');
      counts.set(selected.block.id, (counts.get(selected.block.id) ?? 0) + 1);
      if (options.dither) diffuse(errors, pixelMap.width, pixelMap.height, x, row, adjusted, selected.color);

      const y = options.staircasing === 'none' ? 0 : staircaseOffset(previousY, selected.block.id, options.staircasing, row, lastBoundary);
      const cell = { x, y, z: row + 1, block: selected.block, source: 'cartographer' as const };
      cells.push(cell);
      previousY = y;
      if (options.staircasing === 'boundary') lastBoundary = Math.floor(cell.z / 128);
      if (selected.block.properties?.requires_support && options.supportBlock) cells.push({ x, y: y - 1, z: row + 1, block: options.supportBlock, source: 'cartographer' });
    }
  }

  const minY = Math.min(...cells.map((cell) => cell.y));
  const normalized = cells.map((cell) => ({ ...cell, y: cell.y - minY }));
  return createGrid(normalized, { width: pixelMap.width, height: Math.max(...normalized.map((cell) => cell.y)) + 1, length: pixelMap.height + 1 }, 'cartographer');
}

function staircaseOffset(previous: number, blockId: string, algorithm: MapArtGenerateOptions['staircasing'], row: number, lastBoundary: number) {
  if (algorithm === 'none') return 0;
  const hue = blockId.includes('light') || blockId.includes('white') ? 0 : blockId.includes('dark') || blockId.includes('black') ? 2 : 1;
  const diff = previous + hue - 1;
  if (algorithm === 'continuous') return diff;
  if (algorithm === 'baseline') return previous > 0 && hue === 0 || previous < 0 && hue === 2 ? 0 : diff;
  if (algorithm === 'boundary' && Math.floor((row + 1) / 128) !== lastBoundary) return previous > 0 && hue === 0 || previous < 0 && hue === 2 ? 0 : diff;
  return diff;
}

function diffuse(errors: Array<{ r: number; g: number; b: number }>, width: number, height: number, x: number, y: number, actual: { r: number; g: number; b: number }, target: { r: number; g: number; b: number }) {
  const error = { r: (actual.r - target.r) * 0.35, g: (actual.g - target.g) * 0.35, b: (actual.b - target.b) * 0.35 };
  for (const [dx, dy, factor] of [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]] as const) {
    const nx = x + dx; const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const slot = errors[ny * width + nx]; slot.r += error.r * factor; slot.g += error.g * factor; slot.b += error.b * factor;
  }
}

const clamp = (value: number) => Math.max(0, Math.min(255, value));

