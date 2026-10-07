import type { BlockGrid } from './types.js';
import { validateGrid } from './grid.js';

export type RenderImage = { width: number; height: number; pixels: Uint8ClampedArray };
export type RenderOptions = { width?: number; height?: number; cutaway?: number; scale?: number };

export function renderFloor(grid: BlockGrid, options: RenderOptions = {}): RenderImage {
  validateGrid(grid); const width = options.width ?? Math.max(1, grid.width * 8); const height = options.height ?? Math.max(1, grid.length * 8); const pixels = new Uint8ClampedArray(width * height * 4); const scale = Math.min(width / grid.width, height / grid.length); const cells = new Map<string, any>();
  for (const cell of grid.cells) { const key = `${cell.x}:${cell.z}`; if (!cells.has(key) || cell.y > cells.get(key).y) cells.set(key, cell); }
  for (const cell of cells.values()) fillRect(pixels, width, height, Math.floor((cell.x + 0.5) * scale), Math.floor((cell.z + 0.5) * scale), Math.max(1, Math.ceil(scale)), color(cell.block.id).top);
  return { width, height, pixels };
}

export function renderCutaway(grid: BlockGrid, options: RenderOptions = {}): RenderImage { return renderIso(grid, { ...options, cutaway: options.cutaway ?? 0.55 }); }
export function renderExterior(grid: BlockGrid, options: RenderOptions = {}): RenderImage { return renderIso(grid, { ...options, cutaway: options.cutaway ?? 1 }); }

function renderIso(grid: BlockGrid, options: RenderOptions): RenderImage {
  validateGrid(grid); const width = options.width ?? 900; const height = options.height ?? 560; const pixels = new Uint8ClampedArray(width * height * 4); const tile = options.scale ?? Math.max(4, Math.min(18, 500 / Math.max(grid.width + grid.length, 1))); const originX = width / 2; const originY = 80 + grid.height * tile * 0.4; const limit = (options.cutaway ?? 1) * Math.max(1, grid.height - 1);
  for (const cell of grid.cells) { if (cell.y > limit) continue; const sx = originX + (cell.x - cell.z) * tile * 0.72; const sy = originY + (cell.x + cell.z) * tile * 0.36 - cell.y * tile * 0.72; drawCube(pixels, width, height, sx, sy, tile * 0.72, color(cell.block.id)); }
  return { width, height, pixels };
}
function drawCube(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number, size: number, colors: ReturnType<typeof color>) { const half = size / 2; const depth = size * 0.42; polygon(pixels, width, height, [[x, y], [x + half, y + depth * 0.55], [x, y + depth], [x - half, y + depth * 0.55]], colors.top); polygon(pixels, width, height, [[x - half, y + depth * 0.55], [x, y + depth], [x, y + depth + size], [x - half, y + depth * 0.55 + size * 0.5]], colors.left); polygon(pixels, width, height, [[x, y + depth], [x + half, y + depth * 0.55], [x + half, y + depth * 0.55 + size * 0.5], [x, y + depth + size]], colors.right); }
function polygon(pixels: Uint8ClampedArray, width: number, height: number, points: number[][], rgb: number[]) { const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point[0])))); const maxX = Math.min(width - 1, Math.ceil(Math.max(...points.map((point) => point[0])))); const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1])))); const maxY = Math.min(height - 1, Math.ceil(Math.max(...points.map((point) => point[1])))); for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) { if (!inside(x + 0.5, y + 0.5, points)) continue; const index = (y * width + x) * 4; pixels[index] = rgb[0]; pixels[index + 1] = rgb[1]; pixels[index + 2] = rgb[2]; pixels[index + 3] = 255; } }
function inside(x: number, y: number, points: number[][]) { let hit = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const xi = points[i][0], yi = points[i][1], xj = points[j][0], yj = points[j][1]; const cross = (yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi; if (cross) hit = !hit; } return hit; }
function fillRect(pixels: Uint8ClampedArray, width: number, height: number, cx: number, cy: number, size: number, rgb: number[]) { const startX = Math.max(0, Math.floor(cx - size / 2)); const startY = Math.max(0, Math.floor(cy - size / 2)); for (let y = startY; y < Math.min(height, startY + size); y += 1) for (let x = startX; x < Math.min(width, startX + size); x += 1) { const index = (y * width + x) * 4; pixels[index] = rgb[0]; pixels[index + 1] = rgb[1]; pixels[index + 2] = rgb[2]; pixels[index + 3] = 255; } }
function color(id: string) { let hash = 0; for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0; const hue = hash % 360; return { top: hsl(hue, 55, 58), left: hsl(hue, 48, 38), right: hsl(hue, 50, 46) }; }
function hsl(hue: number, saturation: number, lightness: number) { const s = saturation / 100; const l = lightness / 100; const chroma = (1 - Math.abs(2 * l - 1)) * s; const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1)); const m = l - chroma / 2; const [r, g, b] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x]; return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]; }



