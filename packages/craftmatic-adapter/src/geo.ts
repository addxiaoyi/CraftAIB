import { createGrid, type BlockGrid, type BlockState } from '@craftaib/core';

export type GeoPoint = { lat: number; lng: number };
export type GeoProjectionOptions = { centerLat: number; centerLng: number; resolution?: number; gridCenterX?: number; gridCenterZ?: number };
export type GeoRoad = { nodes: GeoPoint[]; surface?: string; width?: number };
export type GeoSceneInput = { roads?: GeoRoad[]; center: GeoPoint; width: number; length: number; ground?: BlockState; road?: BlockState };

export class GeoProjection {
  private readonly metersLat = 111320;
  private readonly metersLng: number;
  constructor(private readonly options: Required<GeoProjectionOptions>) { this.metersLng = this.metersLat * Math.cos(options.centerLat * Math.PI / 180); }
  toGridXZ(point: GeoPoint) { return { x: Math.round(this.options.gridCenterX + (point.lng - this.options.centerLng) * this.metersLng * this.options.resolution), z: Math.round(this.options.gridCenterZ - (point.lat - this.options.centerLat) * this.metersLat * this.options.resolution) }; }
  toLatLng(x: number, z: number) { return { lat: this.options.centerLat - (z - this.options.gridCenterZ) / (this.options.resolution * this.metersLat), lng: this.options.centerLng + (x - this.options.gridCenterX) / (this.options.resolution * this.metersLng) }; }
}

export function geoSceneToBlockGrid(input: GeoSceneInput): BlockGrid {
  const projection = new GeoProjection({ centerLat: input.center.lat, centerLng: input.center.lng, resolution: 1, gridCenterX: Math.floor(input.width / 2), gridCenterZ: Math.floor(input.length / 2) });
  const ground = input.ground ?? { id: 'minecraft:grass_block' }; const road = input.road ?? { id: 'minecraft:gray_concrete' }; const cells = [];
  for (let z = 0; z < input.length; z += 1) for (let x = 0; x < input.width; x += 1) cells.push({ x, y: 0, z, block: ground, source: 'user' as const });
  for (const roadPath of input.roads ?? []) { const points = roadPath.nodes.map((node) => projection.toGridXZ(node)); for (let i = 1; i < points.length; i += 1) { for (const point of line(points[i - 1], points[i])) { const width = Math.max(1, roadPath.width ?? 2); for (let dx = -width; dx <= width; dx += 1) { const x = point.x + dx; if (x >= 0 && x < input.width && point.z >= 0 && point.z < input.length) cells.push({ x, y: 1, z: point.z, block: road, source: 'user' as const }); } } } }
  return createGrid(uniqueCells(cells), { width: input.width, height: 2, length: input.length }, 'user');
}
function line(a: { x: number; z: number }, b: { x: number; z: number }) { const points = []; let x = a.x, z = a.z; const dx = Math.abs(b.x - a.x), sx = x < b.x ? 1 : -1, dz = -Math.abs(b.z - a.z), sz = z < b.z ? 1 : -1; let error = dx + dz; while (true) { points.push({ x, z }); if (x === b.x && z === b.z) break; const twice = 2 * error; if (twice >= dz) { error += dz; x += sx; } if (twice <= dx) { error += dx; z += sz; } } return points; }
function uniqueCells(cells: Array<{ x: number; y: number; z: number; block: BlockState; source: 'user' }>) { const seen = new Set<string>(); return cells.filter((cell) => { const key = `${cell.x}:${cell.y}:${cell.z}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
