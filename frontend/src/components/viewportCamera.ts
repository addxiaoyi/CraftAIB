export type ViewportView = 'iso' | 'top' | 'front' | 'side';
type Point = [number, number, number];

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
