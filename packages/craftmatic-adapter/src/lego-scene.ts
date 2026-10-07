import type { SceneGraph } from '@craftaib/core';
import type { LDrawBrick } from './ldraw.js';

export type LegoScene = SceneGraph & { metadata: { source: 'ldraw'; brickCount: number; parts: string[]; bounds: { min: [number, number, number]; max: [number, number, number] } } };

export function ldrawToScene(bricks: LDrawBrick[]): LegoScene {
  const xs = bricks.map((brick) => brick.x); const ys = bricks.map((brick) => brick.y); const zs = bricks.map((brick) => brick.z);
  const min: [number, number, number] = bricks.length ? [Math.min(...xs), Math.min(...ys), Math.min(...zs)] : [0, 0, 0];
  const max: [number, number, number] = bricks.length ? [Math.max(...xs), Math.max(...ys), Math.max(...zs)] : [0, 0, 0];
  return { version: 1, grids: [], metadata: { source: 'ldraw', brickCount: bricks.length, parts: [...new Set(bricks.map((brick) => brick.part))], bounds: { min, max }, bricks } } as LegoScene;
}
