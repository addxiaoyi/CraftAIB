import type { LitematicaPlacementState, StructureData, VoxelBlock } from '../types/minecraft';

export function normalizePlacement(value: Partial<LitematicaPlacementState>, index = 0): LitematicaPlacementState {
  return {
    name: value.name?.trim() || `Placement ${index + 1}`,
    ...(value.schematic ? { schematic: value.schematic } : {}),
    position: { x: Math.trunc(value.position?.x ?? 0), y: Math.trunc(value.position?.y ?? 0), z: Math.trunc(value.position?.z ?? 0) },
    enabled: value.enabled !== false,
    locked: value.locked === true,
    rotation: value.rotation ?? 'none',
    mirror: value.mirror ?? 'none',
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
  const { x: width, z: length } = structure.size;
  const mirror = placement.mirror;
  const rotation = placement.rotation;
  const rotate = (x: number, z: number) => {
    let nextX = mirror === 'left_right' ? width - x - 1 : x;
    let nextZ = mirror === 'front_back' ? length - z - 1 : z;
    if (rotation === 'clockwise_90') [nextX, nextZ] = [length - nextZ - 1, nextX];
    if (rotation === 'counter_clockwise_90') [nextX, nextZ] = [nextZ, width - nextX - 1];
    if (rotation === '180') [nextX, nextZ] = [width - nextX - 1, length - nextZ - 1];
    return { x: nextX + placement.position.x, z: nextZ + placement.position.z };
  };
  const blocks: VoxelBlock[] = structure.blocks.map((block) => {
    const next = rotate(block.x, block.z);
    return { ...block, x: next.x, y: block.y + placement.position.y, z: next.z };
  });
  const rotatedSize = rotation === 'clockwise_90' || rotation === 'counter_clockwise_90' ? { x: length, y: structure.size.y, z: width } : structure.size;
  return { ...structure, size: rotatedSize, blocks };
}

export function mergePlacements(structure: StructureData, placements: LitematicaPlacementState[]): StructureData {
  const enabled = placements.filter((placement) => placement.enabled !== false);
  if (!enabled.length) return structure;
  const all = new Map<string, VoxelBlock>();
  const sources = [normalizePlacement({ name: structure.name }) as LitematicaPlacementState, ...enabled];
  for (const placement of sources) {
    const transformed = applyPlacementToStructure(structure, placement);
    for (const block of transformed.blocks) all.set(`${block.x},${block.y},${block.z}`, block);
  }
  const blocks = [...all.values()];
  const minX = Math.min(0, ...blocks.map((block) => block.x));
  const minY = Math.min(0, ...blocks.map((block) => block.y));
  const minZ = Math.min(0, ...blocks.map((block) => block.z));
  const normalized = blocks.map((block) => ({ ...block, x: block.x - minX, y: block.y - minY, z: block.z - minZ }));
  const maxX = Math.max(0, ...normalized.map((block) => block.x));
  const maxY = Math.max(0, ...normalized.map((block) => block.y));
  const maxZ = Math.max(0, ...normalized.map((block) => block.z));
  return { ...structure, blocks: normalized, size: { x: maxX + 1, y: maxY + 1, z: maxZ + 1 } };
}
