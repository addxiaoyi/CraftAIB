import { BLOCK_REGISTRY, findClosestBlock } from './blockRegistry';
import { BlockMeta } from '../types/minecraft';

export type DitherAlgorithm = 'nearest' | 'floyd-steinberg' | 'atkinson';

export interface ProcessedPixel {
  x: number;
  y: number;
  block: BlockMeta;
  height?: number; // For staircase map art
}

// Map art shade multipliers
export function applyMapArtStaircase(
  imageData: ImageData,
  palette: string[],
  algorithm: DitherAlgorithm = 'floyd-steinberg'
): { pixels: ProcessedPixel[]; heightmap: number[][] } {
  const width = imageData.width;
  const height = imageData.height;
  const data = new Float32Array(imageData.data);

  const heightmap: number[][] = Array.from({ length: height }, () => Array(width).fill(0));
  const pixels: ProcessedPixel[] = [];

  for (let x = 0; x < width; x++) {
    let currentYHeight = 64;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 64) {
        heightmap[y][x] = currentYHeight;
        continue;
      }

      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      let targetDy = 0;
      if (luminance > 160) {
        targetDy = 1; // Step up for bright shade
      } else if (luminance < 90) {
        targetDy = -1; // Step down for shadow shade
      } else {
        targetDy = 0;
      }

      currentYHeight = Math.max(1, Math.min(255, currentYHeight + targetDy));
      heightmap[y][x] = currentYHeight;

      const shadeFactor = targetDy === 1 ? 1.15 : targetDy === -1 ? 0.85 : 1.0;
      const targetR = Math.min(255, r * shadeFactor);
      const targetG = Math.min(255, g * shadeFactor);
      const targetB = Math.min(255, b * shadeFactor);

      const matchedBlock = findClosestBlock(targetR, targetG, targetB, palette);
      pixels.push({
        x,
        y,
        block: matchedBlock,
        height: currentYHeight,
      });

      if (algorithm !== 'nearest') {
        const errR = targetR - matchedBlock.rgb[0];
        const errG = targetG - matchedBlock.rgb[1];
        const errB = targetB - matchedBlock.rgb[2];

        if (algorithm === 'floyd-steinberg') {
          diffuseError(data, width, height, x + 1, y, (errR * 7) / 16, (errG * 7) / 16, (errB * 7) / 16);
          diffuseError(data, width, height, x - 1, y + 1, (errR * 3) / 16, (errG * 3) / 16, (errB * 3) / 16);
          diffuseError(data, width, height, x, y + 1, (errR * 5) / 16, (errG * 5) / 16, (errB * 5) / 16);
          diffuseError(data, width, height, x + 1, y + 1, (errR * 1) / 16, (errG * 1) / 16, (errB * 1) / 16);
        } else if (algorithm === 'atkinson') {
          diffuseError(data, width, height, x + 1, y, errR / 8, errG / 8, errB / 8);
          diffuseError(data, width, height, x + 2, y, errR / 8, errG / 8, errB / 8);
          diffuseError(data, width, height, x - 1, y + 1, errR / 8, errG / 8, errB / 8);
          diffuseError(data, width, height, x, y + 1, errR / 8, errG / 8, errB / 8);
          diffuseError(data, width, height, x + 1, y + 1, errR / 8, errG / 8, errB / 8);
          diffuseError(data, width, height, x, y + 2, errR / 8, errG / 8, errB / 8);
        }
      }
    }
  }

  return { pixels, heightmap };
}

export function processImageToPixelArt(
  imageData: ImageData,
  palette: string[],
  algorithm: DitherAlgorithm = 'floyd-steinberg'
): ProcessedPixel[] {
  const width = imageData.width;
  const height = imageData.height;
  const data = new Float32Array(imageData.data);
  const result: ProcessedPixel[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 64) {
        continue;
      }

      const closest = findClosestBlock(r, g, b, palette);
      result.push({ x, y, block: closest });

      if (algorithm !== 'nearest') {
        const errR = r - closest.rgb[0];
        const errG = g - closest.rgb[1];
        const errB = b - closest.rgb[2];

        if (algorithm === 'floyd-steinberg') {
          diffuseError(data, width, height, x + 1, y, (errR * 7) / 16, (errG * 7) / 16, (errB * 7) / 16);
          diffuseError(data, width, height, x - 1, y + 1, (errR * 3) / 16, (errG * 3) / 16, (errB * 3) / 16);
          diffuseError(data, width, height, x, y + 1, (errR * 5) / 16, (errG * 5) / 16, (errB * 5) / 16);
          diffuseError(data, width, height, x + 1, y + 1, (errR * 1) / 16, (errG * 1) / 16, (errB * 1) / 16);
        } else if (algorithm === 'atkinson') {
          diffuseError(data, width, height, x + 1, y, errR / 8, errG / 8, errB / 8);
          diffuseError(data, width, height, x + 2, y, errR / 8, errG / 8, errB / 8);
          diffuseError(data, width, height, x - 1, y + 1, errR / 8, errG / 8, errB / 8);
          diffuseError(data, width, height, x, y + 1, errR / 8, errG / 8, errB / 8);
          diffuseError(data, width, height, x + 1, y + 1, errR / 8, errG / 8, errB / 8);
          diffuseError(data, width, height, x, y + 2, errR / 8, errG / 8, errB / 8);
        }
      }
    }
  }

  return result;
}

function diffuseError(
  data: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
  er: number,
  eg: number,
  eb: number
) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const idx = (y * w + x) * 4;
  data[idx] = Math.max(0, Math.min(255, data[idx] + er));
  data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + eg));
  data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + eb));
}
