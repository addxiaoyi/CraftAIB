import { createGrid, type BlockGrid, type BlockState, type PixelMap, type Rgba } from '@craftaib/core';

export type WaxDither = 'none' | 'floyd-steinberg' | 'atkinson' | 'jarvis-judice-ninke';
export type WaxComparison = 'rgb' | 'cie76' | 'cie94' | 'cie2000' | 'cmc' | 'delta-e-itp';
export type WaxMode = 'flat' | 'staircase';
export type WaxPaletteBlock = {
  block: BlockState;
  color: { r: number; g: number; b: number };
  colorId?: number;
  needSupport?: boolean;
};
export type WaxMapArtOptions = {
  palette: WaxPaletteBlock[];
  mode: WaxMode;
  comparison?: WaxComparison;
  dithering?: WaxDither;
  supportBlock?: BlockState;
  source?: string;
};

type Lab = { l: number; a: number; b: number };
type Match = { block: WaxPaletteBlock; rgb: [number, number, number]; shade: 0 | 1 | 2 };
type PreparedMatch = Match & { lab: Lab; ictcp: [number, number, number] };
type MapCell = { x: number; y: number; z: number; block: BlockState; source: 'waxmapart' };
type ErrorRgb = { r: number; g: number; b: number };

const MAP_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [127, 178, 56], [247, 233, 163], [199, 199, 199], [255, 0, 0], [160, 160, 255], [167, 167, 167], [0, 124, 0],
  [255, 255, 255], [164, 168, 184], [151, 109, 77], [112, 112, 112], [64, 64, 255], [143, 119, 72], [255, 252, 245], [216, 127, 51],
  [178, 76, 216], [102, 153, 216], [229, 229, 51], [127, 204, 25], [242, 127, 165], [76, 76, 76], [153, 153, 153], [76, 127, 153],
  [127, 63, 178], [51, 76, 178], [102, 76, 51], [102, 127, 51], [153, 51, 51], [25, 25, 25], [250, 238, 77], [92, 219, 213],
  [74, 128, 255], [0, 217, 58], [129, 86, 49], [112, 2, 0], [209, 177, 161], [159, 82, 36], [149, 87, 108], [112, 108, 138],
  [186, 133, 36], [103, 117, 53], [160, 77, 78], [57, 41, 35], [135, 107, 98], [87, 92, 92], [122, 73, 88], [76, 62, 92],
  [76, 50, 35], [76, 82, 42], [142, 60, 46], [37, 22, 16], [189, 48, 49], [148, 63, 97], [92, 25, 29], [22, 126, 134],
  [58, 142, 140], [86, 44, 62], [20, 180, 133], [100, 100, 100], [216, 175, 147], [127, 167, 150],
];
const SHADE_FACTORS = [0.71, 0.86, 1] as const;

export function generateWaxMapArt(pixelMap: PixelMap, options: WaxMapArtOptions): BlockGrid {
  if (!Number.isInteger(pixelMap.width) || pixelMap.width < 1 || !Number.isInteger(pixelMap.height) || pixelMap.height < 1) throw new Error('WaxMapArt image dimensions must be positive integers.');
  if (pixelMap.pixels.length !== pixelMap.width * pixelMap.height) throw new Error('WaxMapArt pixel count does not match its dimensions.');
  if (!options.palette.length) throw new Error('WaxMapArt requires at least one palette block.');

  const matches = matchPixels(pixelMap, options);
  const cells = options.mode === 'flat' ? flatBlocks(matches, pixelMap, options) : staircaseBlocks(matches, pixelMap, options);
  const width = pixelMap.width;
  const length = pixelMap.height + 1;
  const height = Math.max(1, ...cells.map((cell) => cell.y + 1));
  const grid = createGrid(cells, { width, height, length }, 'waxmapart');
  grid.metadata = {
    ...(grid.metadata ?? {}),
    mapArt: {
      engine: 'waxmapart',
      mode: options.mode,
      comparison: options.comparison ?? 'cie76',
      dithering: options.dithering ?? 'floyd-steinberg',
      materials: countMaterials(cells),
      imagePixels: pixelMap.width * pixelMap.height,
      mappedPixels: matches.length,
    },
  };
  return grid;
}

function matchPixels(pixelMap: PixelMap, options: WaxMapArtOptions): Match[] {
  const palette: PreparedMatch[] = options.palette.flatMap((block) => options.mode === 'flat'
    ? [{ block, rgb: shade(mapColor(block), SHADE_FACTORS[1]), shade: 1 as const }]
    : SHADE_FACTORS.map((factor, shadeIndex) => ({ block, rgb: shade(mapColor(block), factor), shade: shadeIndex as 0 | 1 | 2 })))
    .map((match) => ({ ...match, lab: toLab({ r: match.rgb[0], g: match.rgb[1], b: match.rgb[2] }), ictcp: srgbToICtCp({ r: match.rgb[0], g: match.rgb[1], b: match.rgb[2] }) }));
  const errors = Array.from({ length: pixelMap.pixels.length }, () => ({ r: 0, g: 0, b: 0 }));
  const result = Array<Match>(pixelMap.pixels.length);
  const dither = options.dithering ?? 'floyd-steinberg';
  const comparison = options.comparison ?? 'cie76';

  for (let y = 0; y < pixelMap.height; y += 1) {
    for (let x = 0; x < pixelMap.width; x += 1) {
      const index = y * pixelMap.width + x;
      const source = pixelMap.pixels[index];
      const error = errors[index];
      const adjusted: Rgba = { r: clamp(source.r + error.r), g: clamp(source.g + error.g), b: clamp(source.b + error.b), a: source.a };
      const adjustedLab = comparison === 'rgb' || comparison === 'delta-e-itp' ? undefined : toLab(adjusted);
      const adjustedICtCp = comparison === 'delta-e-itp' ? srgbToICtCp(adjusted) : undefined;
      let best = palette[0];
      let bestDistance = colorDistance(adjusted, adjustedLab, adjustedICtCp, best, comparison);
      for (let candidate = 1; candidate < palette.length; candidate += 1) {
        const distance = colorDistance(adjusted, adjustedLab, adjustedICtCp, palette[candidate], comparison);
        if (distance < bestDistance) { bestDistance = distance; best = palette[candidate]; }
      }
      result[index] = best;
      if (dither !== 'none') diffuse(errors, pixelMap.width, pixelMap.height, x, y, adjusted, best.rgb, dither);
    }
  }
  return result;
}

function flatBlocks(matches: Match[], pixelMap: PixelMap, options: WaxMapArtOptions): MapCell[] {
  const cells: MapCell[] = [];
  for (let x = 0; x < pixelMap.width; x += 1) {
    cells.push({ x, y: 0, z: 0, block: options.supportBlock ?? { id: 'minecraft:stone' }, source: 'waxmapart' });
    for (let row = 0; row < pixelMap.height; row += 1) {
      const match = matches[row * pixelMap.width + x];
      cells.push({ x, y: 0, z: row + 1, block: match.block.block, source: 'waxmapart' });
      if (match.block.needSupport) cells.push({ x, y: -1, z: row + 1, block: options.supportBlock ?? { id: 'minecraft:stone' }, source: 'waxmapart' });
    }
  }
  const minY = Math.min(0, ...cells.map((cell) => cell.y));
  return dedupeCells(cells.map((cell) => ({ ...cell, y: cell.y - minY })));
}

function staircaseBlocks(matches: Match[], pixelMap: PixelMap, options: WaxMapArtOptions): MapCell[] {
  const cells: MapCell[] = [];
  for (let x = 0; x < pixelMap.width; x += 1) {
    cells.push({ x, y: 0, z: 0, block: options.supportBlock ?? { id: 'minecraft:stone' }, source: 'waxmapart' });
    let currentY = 0;
    const column: MapCell[] = [];
    for (let row = 0; row < pixelMap.height; row += 1) {
      const match = matches[row * pixelMap.width + x];
      currentY += match.shade - 1;
      column.push({ x, y: currentY, z: row + 1, block: match.block.block, source: 'waxmapart' });
      if (match.block.needSupport) column.push({ x, y: currentY - 1, z: row + 1, block: options.supportBlock ?? { id: 'minecraft:stone' }, source: 'waxmapart' });
    }
    const minY = Math.min(0, ...column.map((cell) => cell.y));
    for (const cell of column) cells.push({ ...cell, y: cell.y - minY });
  }
  const minY = Math.min(0, ...cells.map((cell) => cell.y));
  return dedupeCells(cells.map((cell) => ({ ...cell, y: cell.y - minY })));
}

function dedupeCells(cells: MapCell[]): MapCell[] {
  const result = new Map<string, MapCell>();
  for (const cell of cells) result.set(`${cell.x},${cell.y},${cell.z}`, cell);
  return [...result.values()];
}

function countMaterials(cells: MapCell[]): Array<{ block: string; count: number }> {
  const counts = new Map<string, number>();
  for (const cell of cells) counts.set(cell.block.id, (counts.get(cell.block.id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([block, count]) => ({ block, count }));
}

function mapColor(block: WaxPaletteBlock): [number, number, number] {
  if (block.colorId != null && MAP_COLORS[block.colorId]) return [...MAP_COLORS[block.colorId]];
  let nearest = MAP_COLORS[0];
  let best = Infinity;
  for (const candidate of MAP_COLORS) {
    const distance = rgbDistance(block.color, candidate);
    if (distance < best) { best = distance; nearest = candidate; }
  }
  return [...nearest];
}

function shade(color: [number, number, number], factor: number): [number, number, number] {
  return color.map((channel) => Math.trunc(channel * factor)) as [number, number, number];
}

function diffuse(errors: ErrorRgb[], width: number, height: number, x: number, y: number, actual: Rgba, target: [number, number, number], algorithm: WaxDither): void {
  const error = { r: actual.r - target[0], g: actual.g - target[1], b: actual.b - target[2] };
  const kernel = algorithm === 'floyd-steinberg'
    ? [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]
    : algorithm === 'atkinson'
      ? [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]]
      : [[1, 0, 7 / 48], [2, 0, 5 / 48], [-2, 1, 3 / 48], [-1, 1, 5 / 48], [0, 1, 7 / 48], [1, 1, 5 / 48], [2, 1, 3 / 48], [-2, 2, 1 / 48], [-1, 2, 3 / 48], [0, 2, 5 / 48], [1, 2, 3 / 48], [2, 2, 1 / 48]];
  for (const [dx, dy, factor] of kernel) {
    const nx = x + dx; const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const slot = errors[ny * width + nx];
    slot.r += error.r * factor; slot.g += error.g * factor; slot.b += error.b * factor;
  }
}

function colorDistance(color: Rgba, lab: Lab | undefined, ictcp: [number, number, number] | undefined, target: PreparedMatch, metric: WaxComparison): number {
  if (metric === 'rgb') return rgbDistance(color, target.rgb);
  if (metric === 'delta-e-itp') {
    const left = ictcp!; const right = target.ictcp;
    return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
  }
  const first = lab!; const second = target.lab;
  if (metric === 'cie76') return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
  if (metric === 'cie94') return cie94(first, second);
  if (metric === 'cmc') return cmc(first, second);
  return cie2000(first, second);
}

function rgbDistance(color: Pick<Rgba, 'r' | 'g' | 'b'>, target: Pick<Rgba, 'r' | 'g' | 'b'> | readonly [number, number, number]): number {
  const red = 'r' in target ? target.r : target[0];
  const green = 'g' in target ? target.g : target[1];
  const blue = 'b' in target ? target.b : target[2];
  return Math.hypot(color.r - red, color.g - green, color.b - blue);
}

function toLab(color: Pick<Rgba, 'r' | 'g' | 'b'>): Lab {
  const linear = [color.r, color.g, color.b].map((channel) => channel / 255 <= 0.04045 ? channel / 255 / 12.92 : Math.pow((channel / 255 + 0.055) / 1.055, 2.4));
  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047;
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883;
  const f = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = f(x); const fy = f(y); const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function cie94(one: Lab, two: Lab): number {
  const dl = one.l - two.l; const c1 = Math.hypot(one.a, one.b); const c2 = Math.hypot(two.a, two.b); const dc = c1 - c2;
  const dh = Math.sqrt(Math.max(0, (one.a - two.a) ** 2 + (one.b - two.b) ** 2 - dc ** 2));
  const vl = dl; const vc = dc / (1 + 0.045 * c1); const vh = dh / (1 + 0.015 * c1);
  return Math.hypot(vl, vc, vh);
}

function cmc(one: Lab, two: Lab): number {
  const dl = one.l - two.l; const c1 = Math.hypot(one.a, one.b); const c2 = Math.hypot(two.a, two.b); const dc = c1 - c2;
  const dh = Math.sqrt(Math.max(0, (one.a - two.a) ** 2 + (one.b - two.b) ** 2 - dc ** 2));
  const f = Math.sqrt(c1 ** 4 / (c1 ** 4 + 1900)); const hue = ((Math.atan2(one.b, one.a) * 180 / Math.PI) + 360) % 360;
  const t = hue >= 164 && hue <= 345 ? 0.56 + Math.abs(0.2 * Math.cos((hue + 168) * Math.PI / 180)) : 0.36 + Math.abs(0.4 * Math.cos((hue + 35) * Math.PI / 180));
  const sl = one.l < 16 ? 0.511 : 0.040975 * one.l / (1 + 0.01765 * one.l);
  const sc = 0.0638 * c1 / (1 + 0.0131 * c1) + 0.638; const sh = sc * (f * t + 1 - f);
  return Math.hypot(dl / (2 * sl), dc / sc, dh / sh);
}

function cie2000(one: Lab, two: Lab): number {
  const c1 = Math.hypot(one.a, one.b); const c2 = Math.hypot(two.a, two.b); const cbar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cbar ** 7 / (cbar ** 7 + 25 ** 7)));
  const a1 = (1 + g) * one.a; const a2 = (1 + g) * two.a; const cp1 = Math.hypot(a1, one.b); const cp2 = Math.hypot(a2, two.b);
  const h1 = hueAngle(a1, one.b); const h2 = hueAngle(a2, two.b); const dl = two.l - one.l; const dc = cp2 - cp1;
  let dh = h2 - h1; if (cp1 * cp2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin(dh * Math.PI / 360); const lbar = (one.l + two.l) / 2; const cpbar = (cp1 + cp2) / 2;
  let hbar = (h1 + h2) / 2; if (Math.abs(h1 - h2) > 180) hbar += hbar < 180 ? 180 : -180; if (cp1 * cp2 === 0) hbar = h1 + h2;
  const t = 1 - 0.17 * Math.cos((hbar - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hbar * Math.PI / 180) + 0.32 * Math.cos((3 * hbar + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hbar - 63) * Math.PI / 180);
  const deltaTheta = 30 * Math.exp(-(((hbar - 275) / 25) ** 2)); const rc = 2 * Math.sqrt(cpbar ** 7 / (cpbar ** 7 + 25 ** 7));
  const sl = 1 + 0.015 * (lbar - 50) ** 2 / Math.sqrt(20 + (lbar - 50) ** 2); const sc = 1 + 0.045 * cpbar; const sh = 1 + 0.015 * cpbar * t; const rt = -Math.sin(2 * deltaTheta * Math.PI / 180) * rc;
  const vl = dl / sl; const vc = dc / sc; const vh = dH / sh;
  return Math.sqrt(Math.max(0, vl ** 2 + vc ** 2 + vh ** 2 + rt * vc * vh));
}

function hueAngle(a: number, b: number): number {
  const degrees = Math.atan2(b, a) * 180 / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}

function srgbToICtCp(color: Pick<Rgba, 'r' | 'g' | 'b'>): [number, number, number] {
  const rgb = [color.r, color.g, color.b].map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const x = 0.4124564 * rgb[0] + 0.3575761 * rgb[1] + 0.1804375 * rgb[2];
  const y = 0.2126729 * rgb[0] + 0.7151522 * rgb[1] + 0.072175 * rgb[2];
  const z = 0.0193339 * rgb[0] + 0.119192 * rgb[1] + 0.9503041 * rgb[2];
  const l = 0.3593 * x + 0.6976 * y - 0.0359 * z; const m = -0.1921 * x + 1.1005 * y + 0.0754 * z; const s = 0.0071 * x + 0.0748 * y + 0.8433 * z;
  const lp = [l, m, s].map((value) => { const c = Math.pow(Math.max(0, Math.min(1, value)), 0.1593017578125); return Math.pow((0.8359375 + 18.8515625 * c) / (1 + 18.6875 * c), 78.84375); });
  return [(2048 * lp[0] + 2048 * lp[1]) / 4096 * 720, (6610 * lp[0] - 13613 * lp[1] + 7003 * lp[2]) / 4096 * 360, (17933 * lp[0] - 17390 * lp[1] - 543 * lp[2]) / 4096 * 720];
}

function clamp(value: number): number { return Math.max(0, Math.min(255, Math.round(value))); }
