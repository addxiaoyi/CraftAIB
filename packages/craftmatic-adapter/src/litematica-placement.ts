import { createGrid, validateGrid, type BlockGrid, type BlockState } from '@craftaib/core';

export type LitematicaRotation = 'none' | 'clockwise_90' | '180' | 'counter_clockwise_90';
export type LitematicaMirror = 'none' | 'front_back' | 'left_right';
export type LitematicaSubRegionPlacement = {
  name: string;
  displayName?: string;
  position: { x: number; y: number; z: number };
  defaultPosition?: { x: number; y: number; z: number };
  enabled?: boolean;
  renderingEnabled?: boolean;
  rotation?: LitematicaRotation;
  mirror?: LitematicaMirror;
  ignoreEntities?: boolean;
  lockedCoords?: number;
};
export type LitematicaPlacement = {
  name: string;
  schematic?: string;
  position: { x: number; y: number; z: number };
  enabled?: boolean;
  enableRender?: boolean;
  locked?: boolean;
  rotation?: LitematicaRotation;
  mirror?: LitematicaMirror;
  ignoreEntities?: boolean;
  renderEnclosingBox?: boolean;
  lockedCoords?: number;
  selectedRegion?: string;
  regions?: LitematicaSubRegionPlacement[];
};
export type LitematicaPlacementDocument = { placements: LitematicaPlacement[]; selected?: number };

export function parseLitematicaPlacements(input: string | unknown): LitematicaPlacementDocument {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  if (!value || typeof value !== 'object') throw new Error('Litematica placement data must be an object.');
  const source = value as Record<string, unknown>;
  // Native single-placement files also contain `placements`, but those entries are subregions.
  if (typeof source.schematic === 'string' && source.origin !== undefined) return { placements: [parsePlacement(source)], selected: 0 };
  if (!Array.isArray(source.placements)) throw new Error('Litematica placement data is missing placements.');
  const placements = source.placements.map(parsePlacement);
  const selected = source.selected === undefined ? undefined : numberValue(source.selected, -1);
  if (selected !== undefined && selected >= placements.length) throw new Error('Litematica selected placement index is out of range.');
  return { placements, ...(selected !== undefined ? { selected } : {}) };
}

export function serializeLitematicaPlacements(document: LitematicaPlacementDocument): string {
  if (!document || !Array.isArray(document.placements)) throw new Error('Litematica placement document is invalid.');
  return JSON.stringify({ placements: document.placements.map(normalizePlacement), ...(document.selected === undefined ? {} : { selected: document.selected }) }, null, 2);
}

/** A single placement file for the native Litematica 1.20.1 loader. */
export function serializeNativeLitematicaPlacement(input: LitematicaPlacement): string {
  const placement = normalizePlacement(input);
  if (!placement.schematic?.trim()) throw new Error('A native placement requires a schematic file path.');
  const positionArray = (position: LitematicaPlacement['position']) => [position.x, position.y, position.z];
  const rotationName = (rotation: LitematicaRotation = 'none') => ({ none: 'NONE', clockwise_90: 'CLOCKWISE_90', '180': 'CLOCKWISE_180', counter_clockwise_90: 'COUNTERCLOCKWISE_90' })[rotation];
  return JSON.stringify({
    name: placement.name, schematic: placement.schematic, origin: positionArray(placement.position),
    rotation: rotationName(placement.rotation), mirror: placement.mirror!.toUpperCase(),
    enabled: placement.enabled, enable_render: placement.enableRender ?? true,
    locked: placement.locked, locked_coords: placement.lockedCoords,
    ignore_entities: placement.ignoreEntities, render_enclosing_box: placement.renderEnclosingBox,
    ...(placement.selectedRegion ? { selected_region: placement.selectedRegion } : {}),
    placements: (placement.regions ?? []).map((region) => ({ name: region.name, placement: {
      name: region.name, pos: positionArray(region.position),
      rotation: rotationName(region.rotation), mirror: (region.mirror ?? 'none').toUpperCase(),
      enabled: region.enabled ?? true, rendering_enabled: region.renderingEnabled ?? true,
      ignore_entities: region.ignoreEntities ?? false, locked_coords: region.lockedCoords ?? 0,
    } })),
  }, null, 2);
}

export function applyLitematicaPlacement(grid: BlockGrid, placement: LitematicaPlacement): BlockGrid {
  validateGrid(grid);
  const rotation = placement.rotation ?? 'none';
  const mirror = placement.mirror ?? 'none';
  const rotated = rotation === 'clockwise_90' || rotation === 'counter_clockwise_90';
  const width = rotated ? grid.length : grid.width;
  const length = rotated ? grid.width : grid.length;
  const cells = grid.cells.map((cell) => {
    const mirrored = mirrorPosition(cell.x, cell.z, grid.width, grid.length, mirror);
    const position = rotatePosition(mirrored.x, mirrored.z, grid.width, grid.length, rotation);
    return { ...cell, x: position.x, z: position.z, block: transformBlockState(cell.block, rotation, mirror) };
  });
  const origin = placement.position ?? { x: 0, y: 0, z: 0 };
  return { ...createGrid(cells, { width, height: grid.height, length }, 'user'), origin: { x: origin.x + grid.origin.x, y: origin.y + grid.origin.y, z: origin.z + grid.origin.z } };
}

export function normalizePlacement(input: LitematicaPlacement): LitematicaPlacement {
  if (!input?.name?.trim()) throw new Error('Litematica placement name is required.');
  const position = input.position ?? { x: 0, y: 0, z: 0 };
  return {
    ...input,
    name: input.name.trim(),
    position: { x: integer(position.x), y: integer(position.y), z: integer(position.z) },
    enabled: input.enabled ?? true,
    locked: input.locked ?? false,
    rotation: input.rotation ?? 'none',
    mirror: input.mirror ?? 'none',
    ignoreEntities: input.ignoreEntities ?? false,
    renderEnclosingBox: input.renderEnclosingBox ?? false,
    lockedCoords: input.lockedCoords ?? 0,
    ...(input.regions ? { regions: input.regions.map((region) => ({ ...region, position: { x: integer(region.position.x), y: integer(region.position.y), z: integer(region.position.z) }, enabled: region.enabled ?? true, rotation: region.rotation ?? 'none', mirror: region.mirror ?? 'none', ignoreEntities: region.ignoreEntities ?? false, lockedCoords: region.lockedCoords ?? 0 })) } : {}),
  };
}

function parsePlacement(value: unknown): LitematicaPlacement {
  if (!value || typeof value !== 'object') throw new Error('Litematica placement entry is invalid.');
  const item = value as Record<string, any>;
  const position = readPosition(item.origin ?? item.pos ?? item.position);
  if (!item.name || !position) throw new Error('Litematica placement requires name and pos.');
  const regions = item.regions ?? item.placements;
  return normalizePlacement({ name: String(item.name), schematic: typeof item.schematic === 'string' ? item.schematic : undefined, position, enabled: booleanValue(item.enabled, true), enableRender: booleanValue(item.enable_render ?? item.enableRender, true), locked: booleanValue(item.locked, false), rotation: parseRotation(item.rotation), mirror: parseMirror(item.mirror), ignoreEntities: booleanValue(item.ignore_entities ?? item.ignoreEntities, false), renderEnclosingBox: booleanValue(item.render_enclosing_box ?? item.renderEnclosingBox, false), lockedCoords: numberValue(item.locked_coords ?? item.lockedCoords, 0), selectedRegion: typeof (item.selected_region ?? item.selectedRegion) === 'string' ? item.selected_region ?? item.selectedRegion : undefined, regions: Array.isArray(regions) ? regions.map((region: any) => parseSubRegion(region?.placement ?? region)) : undefined });
}

function parseSubRegion(value: unknown): LitematicaSubRegionPlacement {
  if (!value || typeof value !== 'object') throw new Error('Litematica sub-region placement is invalid.');
  const item = value as Record<string, any>;
  const position = readPosition(item.pos ?? item.position);
  if (!item.name || !position) throw new Error('Litematica sub-region placement requires name and pos.');
  return { name: String(item.name), displayName: typeof (item.display_name ?? item.displayName) === 'string' ? item.display_name ?? item.displayName : undefined, position, defaultPosition: readPosition(item.default_pos ?? item.defaultPosition), enabled: booleanValue(item.enabled, true), renderingEnabled: booleanValue(item.rendering_enabled ?? item.renderingEnabled, true), rotation: parseRotation(item.rotation), mirror: parseMirror(item.mirror), ignoreEntities: booleanValue(item.ignore_entities ?? item.ignoreEntities, false), lockedCoords: numberValue(item.locked_coords ?? item.lockedCoords, 0) };
}

function mirrorPosition(x: number, z: number, width: number, length: number, mirror: LitematicaMirror) { if (mirror === 'front_back') return { x: width - x - 1, z }; if (mirror === 'left_right') return { x, z: length - z - 1 }; return { x, z }; }
function rotatePosition(x: number, z: number, width: number, length: number, rotation: LitematicaRotation) { if (rotation === 'clockwise_90') return { x: length - z - 1, z: x }; if (rotation === '180') return { x: width - x - 1, z: length - z - 1 }; if (rotation === 'counter_clockwise_90') return { x: z, z: width - x - 1 }; return { x, z }; }
function transformBlockState(state: BlockState, rotation: LitematicaRotation, mirror: LitematicaMirror): BlockState { if (!state.properties) return state; const properties = { ...state.properties }; if (properties.axis && (rotation === 'clockwise_90' || rotation === 'counter_clockwise_90') && (properties.axis === 'x' || properties.axis === 'z')) properties.axis = properties.axis === 'x' ? 'z' : 'x'; if (properties.facing) properties.facing = transformFacing(properties.facing, rotation, mirror); if (properties.rotation !== undefined && /^\d+$/.test(properties.rotation)) properties.rotation = String(transformRotation(Number(properties.rotation), rotation, mirror)); return { ...state, properties }; }
function transformFacing(facing: string, rotation: LitematicaRotation, mirror: LitematicaMirror) { const order = ['north', 'east', 'south', 'west']; const index = order.indexOf(facing); if (index < 0) return facing; let next = index; if (mirror === 'front_back') next = (4 - next) % 4; if (mirror === 'left_right') next = (2 - next + 4) % 4; if (rotation === 'clockwise_90') next += 1; if (rotation === 'counter_clockwise_90') next -= 1; if (rotation === '180') next += 2; return order[(next + 40) % 4]; }
function transformRotation(value: number, rotation: LitematicaRotation, mirror: LitematicaMirror) { let next = value & 15; if (mirror === 'left_right') next = (8 - next) & 15; if (mirror === 'front_back') next = (16 - next) & 15; if (rotation === 'clockwise_90') next += 4; if (rotation === 'counter_clockwise_90') next -= 4; if (rotation === '180') next += 8; return (next + 32) & 15; }
function readPosition(value: any) { if (!value || typeof value !== 'object') return undefined; if (Array.isArray(value) && value.length !== 3) return undefined; const x = Number(value.x ?? value.X ?? value[0]), y = Number(value.y ?? value.Y ?? value[1]), z = Number(value.z ?? value.Z ?? value[2]); return [x, y, z].every(Number.isSafeInteger) ? { x, y, z } : undefined; }
function parseRotation(value: unknown): LitematicaRotation { return value === 'CLOCKWISE_90' || value === 'clockwise_90' ? 'clockwise_90' : value === 'COUNTERCLOCKWISE_90' || value === 'counter_clockwise_90' ? 'counter_clockwise_90' : value === '180' || value === 'CLOCKWISE_180' ? '180' : 'none'; }
function parseMirror(value: unknown): LitematicaMirror { return value === 'FRONT_BACK' || value === 'front_back' ? 'front_back' : value === 'LEFT_RIGHT' || value === 'left_right' ? 'left_right' : 'none'; }
function integer(value: number) { return Number.isFinite(value) ? Math.trunc(value) : 0; }
function numberValue(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function booleanValue(value: unknown, fallback: boolean) { return typeof value === 'boolean' ? value : fallback; }
