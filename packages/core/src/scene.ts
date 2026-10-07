import type { SceneGraph } from './types.js';
import { mergeGrids } from './merge.js';

export function mergeScenes(scenes: SceneGraph[], offsets?: Array<{ x: number; y: number; z: number }>): SceneGraph {
  if (!scenes.length) throw new Error('At least one SceneGraph is required.');
  const grids = scenes.flatMap((scene) => scene.grids); const gridOffsets = offsets ?? grids.map(() => ({ x: 0, y: 0, z: 0 }));
  return { version: 1, grids: [mergeGrids(grids, gridOffsets)], entities: scenes.flatMap((scene) => scene.entities ?? []), metadata: { mergedScenes: scenes.length, sources: scenes.map((scene) => scene.metadata) } };
}
