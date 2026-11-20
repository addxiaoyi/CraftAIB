type Vec3 = [number, number, number];
type Camera = { position: ArrayLike<number>; target: ArrayLike<number>; fov: number };

/** Walk exact voxel boundaries so a hit always identifies one placement face. */
export function pickVoxel(occupied: ReadonlySet<string>, camera: Camera, x: number, y: number, width: number, height: number, reach: number): { pos: Vec3; normal: Vec3 } | null {
  const forward = Array.from(camera.target, (value, axis) => value - camera.position[axis]);
  const length = Math.hypot(...forward);
  if (!length || width <= 0 || height <= 0) return null;
  const [fx, fy, fz] = forward.map((value) => value / length);
  const horizontal = Math.hypot(fx, fz);
  const right = horizontal > 1e-8 ? [-fz / horizontal, 0, fx / horizontal] : [1, 0, 0];
  const up = [-right[2] * fy, right[2] * fx - right[0] * fz, right[0] * fy];
  const scale = Math.tan(camera.fov * Math.PI / 360);
  const nx = (2 * x / width - 1) * scale * width / height;
  const ny = (1 - 2 * y / height) * scale;
  const ray = [fx, fy, fz].map((value, axis) => value + right[axis] * nx + up[axis] * ny);
  const rayLength = Math.hypot(...ray);
  const direction = ray.map((value) => value / rayLength);
  const pos = Array.from(camera.position, Math.floor) as Vec3;
  const steps = direction.map(Math.sign);
  const delta = direction.map((value) => value === 0 ? Infinity : Math.abs(1 / value));
  const edge = direction.map((value, axis) => value === 0 ? Infinity : (pos[axis] + (value > 0 ? 1 : 0) - camera.position[axis]) / value);
  let normal: Vec3 = [0, 0, 0];
  for (let distance = 0; distance <= length + reach;) {
    if (occupied.has(pos.join(','))) return { pos, normal };
    const axis = edge[0] <= edge[1] && edge[0] <= edge[2] ? 0 : edge[1] <= edge[2] ? 1 : 2;
    distance = edge[axis];
    pos[axis] += steps[axis];
    edge[axis] += delta[axis];
    normal = [0, 0, 0];
    normal[axis] = -steps[axis];
  }
  return null;
}
