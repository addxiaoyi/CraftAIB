import type { StructureData, VoxelBlock } from '../types/minecraft';

export type ViewportView = 'iso' | 'top' | 'front' | 'side';
export const VIEWPORT_FOV = 38;
type Point = [number, number, number];

export type ViewportFocus = { center: Point; size: number; span: Point };
const MIN_FOCUS_SIZE = 16;
const FIT_FRACTION = 0.84;
const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'air', 'cave_air', 'void_air']);

export function viewportFocus(size: Point, blocks: ReadonlyArray<Pick<VoxelBlock, 'x' | 'y' | 'z' | 'blockId'>>): ViewportFocus {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const { x, y, z, blockId } of blocks) {
    if (AIR.has(blockId)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  if (minX === Infinity) {
    return { center: [size[0] / 2, size[1] / 2, size[2] / 2], size: Math.max(...size, MIN_FOCUS_SIZE), span: size };
  }
  const span: Point = [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1];

  return {
    center: [minX + span[0] / 2, minY + span[1] / 2, minZ + span[2] / 2],
    size: Math.max(...span, MIN_FOCUS_SIZE),
    span,
  };
}

export function viewportCameraKey(structure: StructureData): string {
  const { id, size: { x, y, z }, plan } = structure;
  const facing = plan?.referenceFacing;
  return `${id}:${x}x${y}x${z}:${isReferenceFacing(facing) ? facing : 'z-max'}`;
}

export function isReferenceFacing(facing: unknown): facing is 'x-min' | 'x-max' | 'z-min' | 'z-max' {
  return facing === 'x-min' || facing === 'x-max' || facing === 'z-min' || facing === 'z-max';
}

function frontDirection(facing: unknown): [number, number] {
  switch (facing) {
    case 'x-min': return [-1, 0];
    case 'x-max': return [1, 0];
    case 'z-min': return [0, -1];
    default: return [0, 1];
  }
}

export function viewportCameraPosition(center: Point, size: number, view: ViewportView, facing: unknown): Point {
  const [x, y, z] = center;
  if (view === 'top') return [x, y + size * 2, z + 0.01];

  const [frontX, frontZ] = frontDirection(facing);
  const sideX = frontZ;
  const sideZ = -frontX;
  const faceDistance = size * 1.8;
  if (view === 'front') return [x + frontX * faceDistance, y, z + frontZ * faceDistance];
  if (view === 'side') return [x + sideX * faceDistance, y, z + sideZ * faceDistance];

  const isoDistance = size * 1.3;
  return [x + (frontX + sideX) * isoDistance, y + size, z + (frontZ + sideZ) * isoDistance];
}

export function frameViewport(focus: ViewportFocus, view: ViewportView, facing: unknown, aspect: number): Point {
  const { center, size, span } = focus;
  const preset = viewportCameraPosition(center, size, view, facing);
  const dx = preset[0] - center[0], dy = preset[1] - center[1], dz = preset[2] - center[2];
  const distance = Math.hypot(dx, dy, dz);
  const [fx, fy, fz] = [dx / distance, dy / distance, dz / distance];
  const horizontal = Math.hypot(fx, fz);
  const [rx, rz] = [fz / horizontal, -fx / horizontal];
  const [ux, uy, uz] = [rz * fy, horizontal, -rx * fy];
  const tanY = Math.tan(VIEWPORT_FOV * Math.PI / 360) * FIT_FRACTION;
  const tanX = tanY * aspect;
  let fitted = distance;

  // Project every occupied bounds corner because the front edge is closer to the lens.
  for (const x of [-span[0] / 2, span[0] / 2]) {
    for (const y of [-span[1] / 2, span[1] / 2]) {
      for (const z of [-span[2] / 2, span[2] / 2]) {
        const depth = x * fx + y * fy + z * fz;
        const across = Math.abs(x * rx + z * rz);
        const up = Math.abs(x * ux + y * uy + z * uz);
        fitted = Math.max(fitted, depth + Math.max(across / tanX, up / tanY));
      }
    }
  }
  return [center[0] + fx * fitted, center[1] + fy * fitted, center[2] + fz * fitted];
}
