import type { BlockState } from '@craftaib/core';
import { modelsForState, type TexturePack } from './texture-pack.js';

export type Lookup = Map<string, BlockState>;

const SIDES = ['west', 'east', 'down', 'up', 'north', 'south'] as const;

// Connector blocks (fences, panes, walls, pipes, wires) are the only families
// whose texture model switches purely on nearby block ids. They need the grid
// to look right, and skipping the pass for every other block avoids an
// expensive per-cell neighbour lookup.
const CONNECTED = /(^|:)([a-z0-9_]+_)?(fence|wall|pipe|pane|redstone_wire|bars)$/;

export function needsLookup(id: string): boolean {
  return CONNECTED.test(id);
}

export function connectorSides(pack: TexturePack, state: BlockState, neighbours: Partial<Record<(typeof SIDES)[number], BlockState[]>>): Partial<Record<(typeof SIDES)[number], string>> {
  const known = new Set<string>();
  for (const variant of modelsForState(pack, state)) {
    for (const element of variant.model.elements) for (const side of SIDES) if (element.faces[side]) known.add(side);
  }
  const result: Partial<Record<(typeof SIDES)[number], string>> = {};
  if (!known.size) return result;
  for (const side of SIDES) {
    const candidates = neighbours[side];
    if (!candidates) continue;
    const value = known.has(side) ? connectionValue(state.id, candidates) : 'false';
    if (value !== 'false') result[side] = value;
  }
  return result;
}

// Fences and panes want true/false, everything else wants the neighbour id or
// its bare path, and a few want a collision shape such as low or tall.
function connectionValue(id: string, candidates: BlockState[]): string | undefined {
  return candidates.map((candidate) => candidate.id).join('|') || id;
}
