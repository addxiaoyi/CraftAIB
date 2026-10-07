import { createGrid, type BlockGrid, type BlockState, type SceneGraph } from '@craftaib/core';
import type { LDrawBrick } from './ldraw.js';

export type LegoScene = SceneGraph & { metadata: { source: 'ldraw'; brickCount: number; parts: string[]; bounds: { min: [number, number, number]; max: [number, number, number] }; bricks: LDrawBrick[] } };
export type LegoVoxelOptions = { lduPerBlock?: number; defaultBlock?: BlockState; colorBlocks?: Record<number, BlockState> };

export function ldrawToScene(bricks: LDrawBrick[]): LegoScene {
  const xs = bricks.map((brick) => brick.x); const ys = bricks.map((brick) => brick.y); const zs = bricks.map((brick) => brick.z); const min: [number, number, number] = bricks.length ? [Math.min(...xs), Math.min(...ys), Math.min(...zs)] : [0, 0, 0]; const max: [number, number, number] = bricks.length ? [Math.max(...xs), Math.max(...ys), Math.max(...zs)] : [0, 0, 0];
  return { version: 1, grids: [], metadata: { source: 'ldraw', brickCount: bricks.length, parts: [...new Set(bricks.map((brick) => brick.part))], bounds: { min, max }, bricks } };
}

export function ldrawToBlockGrid(bricks: LDrawBrick[], options: LegoVoxelOptions = {}): BlockGrid {
  const ldu = options.lduPerBlock ?? 20; const defaultBlock = options.defaultBlock ?? { id: 'minecraft:stone' }; const cells = new Map<string, { x: number; y: number; z: number; block: BlockState; source: 'user' }>();
  for (const brick of bricks) { const x = Math.floor(brick.x / ldu); const y = Math.floor(-brick.y / ldu); const z = Math.floor(brick.z / ldu); const block = options.colorBlocks?.[brick.color] ?? defaultBlock; cells.set(`${x}:${y}:${z}`, { x, y, z, block, source: 'user' }); }
  if (!cells.size) throw new Error('LDraw document contains no brick placements.'); const values = [...cells.values()]; const minX = Math.min(...values.map((cell) => cell.x)); const minY = Math.min(...values.map((cell) => cell.y)); const minZ = Math.min(...values.map((cell) => cell.z)); const normalized = values.map((cell) => ({ ...cell, x: cell.x - minX, y: cell.y - minY, z: cell.z - minZ }));
  return createGrid(normalized, { width: Math.max(...normalized.map((cell) => cell.x)) + 1, height: Math.max(...normalized.map((cell) => cell.y)) + 1, length: Math.max(...normalized.map((cell) => cell.z)) + 1 }, 'user');
}

export function legoSceneToBlockGrid(scene: LegoScene, options: LegoVoxelOptions = {}) { return ldrawToBlockGrid(scene.metadata.bricks, options); }
