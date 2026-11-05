/**
 * Structural analysis of a generated build, in the terms BuilderGPT's preview
 * pipeline uses: which block states exist, how much of the voxel field is filled,
 * and which faces end up visible once interior faces are culled.
 *
 * This is the data the upstream model baker needs before it can skin anything, so
 * computing it here is what makes a schematic previewable at all -- a build whose
 * exposed-face count is zero is hollow of meaning even if it is not hollow of blocks.
 */
import type { BlockGrid } from '@craftaib/core';
import { validateGrid } from '@craftaib/core';

export type BuildStats = {
  width: number;
  height: number;
  length: number;
  /** Solid (non-air) cells a schematic actually stores. */
  cells: number;
  /** Share of the bounding box that is a block, 0..1. */
  fill: number;
  /** Distinct block ids, sorted. */
  palette: string[];
  /** Block states carrying properties, e.g. `minecraft:oak_stairs[half=top]`. */
  states: number;
  /** Solid cells touching the bounding box, on any of its six sides. */
  shell: number;
  /** Solid cells with all six neighbours solid: the buried core. */
  interior: number;
  /** Faces a mesher would emit: one per solid:empty pair inside the box. */
  exposedFaces: number;
  /** Counts per block id, sorted by descending count. */
  materials: Array<{ id: string; count: number }>;
};

const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export function analyzeBuild(grid: BlockGrid): BuildStats {
  validateGrid(grid);
  const { width, height, length } = grid;
  const solid = new Map<string, string>();
  for (const cell of grid.cells) {
    if (cell.block.id !== 'minecraft:air') solid.set(`${cell.x},${cell.y},${cell.z}`, cell.block.id);
  }

  const counts = new Map<string, number>();
  for (const id of solid.values()) counts.set(id, (counts.get(id) ?? 0) + 1);
  const materials = [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  let shell = 0;
  let interior = 0;
  let exposedFaces = 0;
  for (const key of solid.keys()) {
    const [x, y, z] = key.split(',').map(Number);
    if (x === 0 || y === 0 || z === 0 || x === width - 1 || y === height - 1 || z === length - 1) shell += 1;
    let buried = true;
    for (const [dx, dy, dz] of DIRECTIONS) {
      const nx = x + dx; const ny = y + dy; const nz = z + dz;
      const inside = nx >= 0 && ny >= 0 && nz >= 0 && nx < width && ny < height && nz < length;
      const filled = inside ? solid.has(`${nx},${ny},${nz}`) : false;
      if (!filled) { buried = false; exposedFaces += 1; }
    }
    if (buried) interior += 1;
  }

  return {
    width,
    height,
    length,
    cells: solid.size,
    fill: solid.size / (width * height * length),
    palette: [...counts.keys()].sort(),
    states: grid.cells.filter((cell) => cell.block.properties && Object.keys(cell.block.properties).length > 0).length,
    shell,
    interior,
    exposedFaces,
    materials,
  };
}
