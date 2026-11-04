import type { StructureData, VoxelBlock, VoxelRegion } from '../types/minecraft';
import { mapStructureNbt, type Position } from './nbt';

export type StructureTransform = 'rotate90' | 'mirrorX' | 'mirrorZ';
const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;

function transformDirection(direction: string, transform: StructureTransform): string {
  const index = DIRECTIONS.indexOf(direction as typeof DIRECTIONS[number]);
  if (index < 0) return direction;
  if (transform === 'rotate90') return DIRECTIONS[(index + 1) % DIRECTIONS.length];
  return DIRECTIONS[(transform === 'mirrorX' ? 4 - index : 6 - index) % DIRECTIONS.length];
}

export function transformBlockState(state: VoxelBlock['state'], transform: StructureTransform): VoxelBlock['state'] {
  if (!state) return undefined;
  const properties: Record<string, string> = {};
  for (const [key, value] of Object.entries(state)) properties[transformDirection(key, transform)] = value;
  if (state.facing) properties.facing = transformDirection(state.facing, transform);
  if (state.orientation) properties.orientation = state.orientation.split('_').map((direction) => transformDirection(direction, transform)).join('_');
  if (transform === 'rotate90' && (state.axis === 'x' || state.axis === 'z')) properties.axis = state.axis === 'x' ? 'z' : 'x';
  if (state.rotation !== undefined && /^\d+$/.test(state.rotation)) {
    const rotation = Number(state.rotation);
    properties.rotation = String((transform === 'rotate90' ? rotation + 4 : transform === 'mirrorX' ? -rotation : 8 - rotation) & 15);
  }
  if (state.shape?.startsWith('ascending_')) properties.shape = `ascending_${transformDirection(state.shape.slice(10), transform)}`;
  else if (state.shape && /^(north|south|east|west)_(north|south|east|west)$/.test(state.shape)) {
    const sides = state.shape.split('_').map((direction) => transformDirection(direction, transform));
    properties.shape = ['north_south', 'east_west', 'south_east', 'south_west', 'north_west', 'north_east'].find((shape) => shape.split('_').every((direction) => sides.includes(direction))) ?? state.shape;
  }
  if (transform !== 'rotate90') {
    for (const key of ['hinge', 'type', 'shape']) {
      const value = properties[key];
      if (value === 'left' || value === 'right') properties[key] = value === 'left' ? 'right' : 'left';
      else if (value && /^(inner|outer)_(left|right)$/.test(value)) properties[key] = value.replace(/(left|right)$/, (side) => side === 'left' ? 'right' : 'left');
    }
  }
  return properties;
}

export function transformStructure(structure: StructureData, transform: StructureTransform): StructureData {
  const { x: width, z: length } = structure.size;
  const blocks = structure.blocks.map((block) => {
    const x = transform === 'rotate90' ? length - block.z - 1 : transform === 'mirrorX' ? width - block.x - 1 : block.x;
    const z = transform === 'rotate90' ? block.x : transform === 'mirrorZ' ? length - block.z - 1 : block.z;
    return { ...block, x, z, ...(block.state ? { state: transformBlockState(block.state, transform) } : {}) };
  });
  const regions = structure.regions.map((region): VoxelRegion => {
    const [minX, minY, minZ] = region.bounds.min;
    const [maxX, maxY, maxZ] = region.bounds.max;
    if (transform === 'rotate90') return { ...region, bounds: { min: [length - maxZ, minY, minX], max: [length - minZ, maxY, maxX] } };
    if (transform === 'mirrorX') return { ...region, bounds: { min: [width - maxX, minY, minZ], max: [width - minX, maxY, maxZ] } };
    return { ...region, bounds: { min: [minX, minY, length - maxZ], max: [maxX, maxY, length - minZ] } };
  });
  // Geometry edits invalidate the generation recipe; exports use the edited voxel snapshot.
  const { plan: _plan, ...snapshot } = structure;
  const move = (point: Position, edge: number): Position => ({
    x: transform === 'rotate90' ? length - point.z - edge : transform === 'mirrorX' ? width - point.x - edge : point.x,
    y: point.y,
    z: transform === 'rotate90' ? point.x : transform === 'mirrorZ' ? length - point.z - edge : point.z,
  });
  const rotateYaw = (yaw: number) => transform === 'rotate90' ? yaw + 90 : transform === 'mirrorX' ? -yaw : 180 - yaw;
  const metadata = mapStructureNbt(structure.metadata, (point) => move(point, 1), (point) => move(point, 0), rotateYaw);
  return { ...snapshot, blocks, regions, metadata, size: transform === 'rotate90' ? { x: length, y: structure.size.y, z: width } : structure.size };
}
