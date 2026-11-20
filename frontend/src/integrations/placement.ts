import type { LitematicaPlacementState, StructureData, VoxelBlock } from '../types/minecraft';
import { transformStructure } from './transforms';
import { mapStructureNbt, NBT_COLLECTIONS, type Position } from './nbt';

export function normalizePlacement(value: Partial<LitematicaPlacementState>, index = 0): LitematicaPlacementState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Placement must be an object.');
  const native = value as Partial<LitematicaPlacementState> & { pos?: Position };
  const position = native.position ?? native.pos ?? { x: 0, y: 0, z: 0 };
  if (![position.x, position.y, position.z].every(Number.isSafeInteger)) throw new Error('Placement coordinates must be whole numbers.');
  const rotation = String(value.rotation ?? 'none').toLowerCase().replace('clockwise_180', '180').replace('counterclockwise_90', 'counter_clockwise_90');
  const mirror = String(value.mirror ?? 'none').toLowerCase();
  if (!['none', 'clockwise_90', '180', 'counter_clockwise_90'].includes(rotation)) throw new Error('Placement rotation is invalid.');
  if (!['none', 'front_back', 'left_right'].includes(mirror)) throw new Error('Placement mirror is invalid.');
  return {
    name: value.name?.trim() || `Placement ${index + 1}`,
    ...(value.schematic ? { schematic: value.schematic } : {}),
    position: { ...position },
    enabled: value.enabled !== false,
    locked: value.locked === true,
    rotation: rotation as LitematicaPlacementState['rotation'],
    mirror: mirror as LitematicaPlacementState['mirror'],
    ...(value.selectedRegion ? { selectedRegion: value.selectedRegion } : {}),
  };
}

export function serializePlacements(placements: LitematicaPlacementState[]): string {
  return JSON.stringify({ placements: placements.map((placement) => ({ ...placement, pos: placement.position })) }, null, 2);
}

export function downloadPlacements(placements: LitematicaPlacementState[], name: string): void {
  const url = URL.createObjectURL(new Blob([serializePlacements(placements)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name || 'structure'}.placements.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function applyPlacementToStructure(structure: StructureData, placement: LitematicaPlacementState): StructureData {
  let transformed = structure;
  if (placement.mirror !== 'none') transformed = transformStructure(transformed, placement.mirror === 'front_back' ? 'mirrorX' : 'mirrorZ');
  const turns = placement.rotation === 'clockwise_90' ? 1 : placement.rotation === '180' ? 2 : placement.rotation === 'counter_clockwise_90' ? 3 : 0;
  for (let turn = 0; turn < turns; turn += 1) transformed = transformStructure(transformed, 'rotate90');
  const move = (point: Position) => ({ x: point.x + placement.position.x, y: point.y + placement.position.y, z: point.z + placement.position.z });
  const regions = transformed.regions.map((region) => ({ ...region, bounds: { min: region.bounds.min.map((coordinate, index) => coordinate + [placement.position.x, placement.position.y, placement.position.z][index]) as [number, number, number], max: region.bounds.max.map((coordinate, index) => coordinate + [placement.position.x, placement.position.y, placement.position.z][index]) as [number, number, number] } }));
  const { plan: _plan, ...snapshot } = transformed;
  return { ...snapshot, regions, blocks: transformed.blocks.map((block) => ({ ...block, ...move(block) })), metadata: mapStructureNbt(transformed.metadata, move) };
}

export function mergePlacements(structure: StructureData, placements: LitematicaPlacementState[]): StructureData {
  const enabled = placements.filter((placement) => placement.enabled !== false);
  if (!enabled.length) return structure;
  const all = new Map<string, VoxelBlock>();
  const regions: StructureData['regions'] = [];
  const metadata: NonNullable<StructureData['metadata']> = { ...structure.metadata };
  for (const key of NBT_COLLECTIONS) metadata[key] = [];
  const sources = [normalizePlacement({ name: structure.name }) as LitematicaPlacementState, ...enabled];
  for (const [index, placement] of sources.entries()) {
    const transformed = applyPlacementToStructure(structure, placement);
    for (const block of transformed.blocks) all.set(`${block.x},${block.y},${block.z}`, block);
    for (const region of transformed.regions) regions.push({ ...region, id: `${index}-${region.id}`, name: index === 0 ? region.name : `${placement.name}: ${region.name}` });
    for (const key of NBT_COLLECTIONS) for (const entry of transformed.metadata?.[key] ?? []) metadata[key]?.push(entry);
  }
  const blocks = [...all.values()];
  let minX = 0, minY = 0, minZ = 0, maxX = 0, maxY = 0, maxZ = 0;
  for (const block of blocks) {
    minX = Math.min(minX, block.x); minY = Math.min(minY, block.y); minZ = Math.min(minZ, block.z);
    maxX = Math.max(maxX, block.x); maxY = Math.max(maxY, block.y); maxZ = Math.max(maxZ, block.z);
  }
  const normalized = blocks.map((block) => ({ ...block, x: block.x - minX, y: block.y - minY, z: block.z - minZ }));
  const normalizedRegions = regions.map((region) => ({ ...region, bounds: { min: region.bounds.min.map((coordinate, index) => coordinate - [minX, minY, minZ][index]) as [number, number, number], max: region.bounds.max.map((coordinate, index) => coordinate - [minX, minY, minZ][index]) as [number, number, number] } }));
  const offset = (point: Position) => ({ x: point.x - minX, y: point.y - minY, z: point.z - minZ });
  const origin = structure.origin ?? { x: 0, y: 0, z: 0 };
  const { plan: _plan, ...snapshot } = structure;
  return { ...snapshot, origin: { x: origin.x + minX, y: origin.y + minY, z: origin.z + minZ }, blocks: normalized, regions: normalizedRegions, metadata: mapStructureNbt(metadata, offset), size: { x: maxX - minX + 1, y: maxY - minY + 1, z: maxZ - minZ + 1 } };
}
