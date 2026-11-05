import type { StructureData } from '../types/minecraft';

export type Position = { x: number; y: number; z: number };
export const NBT_COLLECTIONS = ['entities', 'blockEntities', 'pendingBlockTicks'] as const;
type Compound = Record<string, unknown>;

function record(value: unknown): value is Compound {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numberTag(value: unknown): number | undefined {
  const scalar = record(value) ? value.value : value;
  return typeof scalar === 'number' && Number.isFinite(scalar) ? scalar : undefined;
}

function nbtCompound(entry: Compound): Compound {
  if (record(entry.nbt)) return entry.nbt;
  if ((entry.type === 'compound' || entry.type === 10) && record(entry.value)) return entry.value;
  return entry;
}

export function nbtPosition(entry: unknown): Position | undefined {
  if (!record(entry)) return undefined;
  const compound = nbtCompound(entry);
  const positionTag = record(compound.Pos) ? compound.Pos.value : compound.Pos;
  const coordinates = record(positionTag) ? positionTag.value : positionTag;
  const position = record(entry.position) ? entry.position : Array.isArray(coordinates) ? { x: coordinates[0], y: coordinates[1], z: coordinates[2] } : compound;
  const x = numberTag(position.x), y = numberTag(position.y), z = numberTag(position.z);
  return x !== undefined && y !== undefined && z !== undefined ? { x, y, z } : undefined;
}

function replaceScalar(tag: unknown, value: number): unknown {
  return record(tag) ? { ...tag, value } : value;
}

export function mapNbtPosition(entry: unknown, move: (position: Position) => Position, rotateYaw?: (yaw: number) => number): unknown {
  const position = nbtPosition(entry);
  if (!record(entry) || !position) return entry;
  const nextPosition = move(position);
  const compound = { ...nbtCompound(entry) };
  for (const axis of ['x', 'y', 'z'] as const) {
    if (axis in compound) compound[axis] = replaceScalar(compound[axis], nextPosition[axis]);
  }
  const posTag = compound.Pos;
  if (record(posTag) && record(posTag.value) && Array.isArray(posTag.value.value)) {
    compound.Pos = { ...posTag, value: { ...posTag.value, value: posTag.value.value.map((tag, index) => index < 3 ? replaceScalar(tag, [nextPosition.x, nextPosition.y, nextPosition.z][index]) : tag) } };
  } else if (Array.isArray(posTag)) compound.Pos = [nextPosition.x, nextPosition.y, nextPosition.z];
  const rotationTag = compound.Rotation;
  if (rotateYaw && record(rotationTag) && record(rotationTag.value) && Array.isArray(rotationTag.value.value)) {
    const values = [...rotationTag.value.value];
    const yaw = numberTag(values[0]);
    if (yaw !== undefined) {
      values[0] = replaceScalar(values[0], rotateYaw(yaw));
      compound.Rotation = { ...rotationTag, value: { ...rotationTag.value, value: values } };
    }
  }
  if (record(entry.nbt)) return { ...entry, position: nextPosition, nbt: compound };
  if ((entry.type === 'compound' || entry.type === 10) && record(entry.value)) return { ...entry, value: compound };
  return { ...compound, ...(record(entry.position) ? { position: nextPosition } : {}) };
}

export function mapStructureNbt(metadata: StructureData['metadata'], moveBlock: (position: Position) => Position, moveEntity = moveBlock, rotateYaw?: (yaw: number) => number): StructureData['metadata'] {
  if (!metadata) return undefined;
  const next = { ...metadata };
  for (const key of NBT_COLLECTIONS) {
    if (Array.isArray(metadata[key])) next[key] = metadata[key].map((entry) => mapNbtPosition(entry, key === 'entities' ? moveEntity : moveBlock, key === 'entities' ? rotateYaw : undefined));
  }
  return next;
}
