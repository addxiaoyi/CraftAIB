import type { StructureData, VoxelBlock, VoxelRegion } from '../types/minecraft';
import { structureToGrid } from './engine';
import { mapStructureNbt, nbtPosition, NBT_COLLECTIONS, type Position } from './nbt';

export type ExportRegion = { name: string; grid: ReturnType<typeof structureToGrid>; position: Position; size: Position };

function contains(region: VoxelRegion, point: Position): boolean {
  return point.x >= region.bounds.min[0] && point.x < region.bounds.max[0]
    && point.y >= region.bounds.min[1] && point.y < region.bounds.max[1]
    && point.z >= region.bounds.min[2] && point.z < region.bounds.max[2];
}

export function structureRegions(structure: StructureData): ExportRegion[] {
  const buckets = [...structure.regions.map((region) => ({ name: region.name, blocks: [] as VoxelBlock[], metadata: {} as NonNullable<StructureData['metadata']> })), { name: 'Unassigned structure', blocks: [] as VoxelBlock[], metadata: {} as NonNullable<StructureData['metadata']> }];
  const bucketIndex = (point?: Position) => {
    if (point) for (let index = structure.regions.length - 1; index >= 0; index -= 1) if (contains(structure.regions[index], point)) return index;
    return structure.regions.length;
  };
  for (const block of structure.blocks) buckets[bucketIndex(block)].blocks.push(block);
  for (const key of NBT_COLLECTIONS) {
    for (const entry of structure.metadata?.[key] ?? []) {
      const metadata = buckets[bucketIndex(nbtPosition(entry))].metadata;
      (metadata[key] ??= []).push(entry);
    }
  }
  const usedNames = new Set<string>();
  const origin = structure.origin ?? { x: 0, y: 0, z: 0 };
  return buckets.flatMap((bucket) => {
    const metadataPoints = NBT_COLLECTIONS.flatMap((key) => (bucket.metadata[key] ?? []).flatMap((entry) => { const point = nbtPosition(entry); return point ? [point] : []; }));
    if (!bucket.blocks.length && !NBT_COLLECTIONS.some((key) => bucket.metadata[key]?.length)) return [];
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const point of [...bucket.blocks, ...metadataPoints]) {
      minX = Math.min(minX, Math.floor(point.x)); minY = Math.min(minY, Math.floor(point.y)); minZ = Math.min(minZ, Math.floor(point.z));
      maxX = Math.max(maxX, Math.floor(point.x)); maxY = Math.max(maxY, Math.floor(point.y)); maxZ = Math.max(maxZ, Math.floor(point.z));
    }
    if (!Number.isFinite(minX)) minX = minY = minZ = maxX = maxY = maxZ = 0;
    const size = { x: maxX - minX + 1, y: maxY - minY + 1, z: maxZ - minZ + 1 };
    const offset = (point: Position) => ({ x: point.x - minX, y: point.y - minY, z: point.z - minZ });
    const grid = structureToGrid({ ...structure, origin: { x: 0, y: 0, z: 0 }, blocks: bucket.blocks.map((block) => ({ ...block, ...offset(block) })), size, metadata: mapStructureNbt(bucket.metadata, offset) });
    const baseName = bucket.name.trim() || 'Region';
    let name = baseName;
    for (let suffix = 2; usedNames.has(name); suffix += 1) name = `${baseName} ${suffix}`;
    usedNames.add(name);
    return [{ name, grid, size, position: { x: origin.x + minX, y: origin.y + minY, z: origin.z + minZ } }];
  });
}
