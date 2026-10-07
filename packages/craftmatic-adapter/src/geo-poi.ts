import { createGrid, type BlockGrid, type BlockState } from '@craftaib/core';
import type { GeoPoint } from './geo.js';

type GeoPoi = { point: GeoPoint; kind: 'tree' | 'lamp' | 'bench' | 'water' | 'marker'; block?: BlockState; height?: number };
export type GeoPoiSceneInput = { center: GeoPoint; width: number; length: number; pois: GeoPoi[]; ground?: BlockState };

export function geoPoisToBlockGrid(input: GeoPoiSceneInput): BlockGrid {
  const metersLat = 111320; const metersLng = metersLat * Math.cos(input.center.lat * Math.PI / 180); const centerX = Math.floor(input.width / 2); const centerZ = Math.floor(input.length / 2); const ground = input.ground ?? { id: 'minecraft:grass_block' }; const cells = [];
  for (let z = 0; z < input.length; z += 1) for (let x = 0; x < input.width; x += 1) cells.push({ x, y: 0, z, block: ground, source: 'user' as const });
  for (const poi of input.pois) { const x = Math.round(centerX + (poi.point.lng - input.center.lng) * metersLng); const z = Math.round(centerZ - (poi.point.lat - input.center.lat) * metersLat); if (x < 0 || x >= input.width || z < 0 || z >= input.length) continue; const block = poi.block ?? defaultBlock(poi.kind); const height = Math.max(1, poi.height ?? (poi.kind === 'tree' || poi.kind === 'lamp' ? 3 : 1)); for (let y = 1; y <= height; y += 1) cells.push({ x, y, z, block, source: 'user' as const }); }
  return createGrid(unique(cells), { width: input.width, height: Math.max(2, ...cells.map((cell) => cell.y + 1)), length: input.length }, 'user');
}
function defaultBlock(kind: GeoPoi['kind']): BlockState { if (kind === 'tree') return { id: 'minecraft:oak_log' }; if (kind === 'lamp') return { id: 'minecraft:lantern' }; if (kind === 'water') return { id: 'minecraft:water' }; if (kind === 'bench') return { id: 'minecraft:oak_slab' }; return { id: 'minecraft:gold_block' }; }
function unique(cells: Array<{ x: number; y: number; z: number; block: BlockState; source: 'user' }>) { const seen = new Set<string>(); return cells.filter((cell) => { const key = `${cell.x}:${cell.y}:${cell.z}`; if (seen.has(key)) return false; seen.add(key); return true; }); }

