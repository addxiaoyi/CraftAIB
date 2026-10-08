import type { BlockGrid, SceneGraph } from './types.js';
import { mergeGrids } from './merge.js';

export function mergeScenes(scenes: SceneGraph[], offsets?: Array<{ x: number; y: number; z: number }>): SceneGraph {
  if (!scenes.length) throw new Error('At least one SceneGraph is required.');
  const grids = scenes.flatMap((scene) => scene.grids); const gridOffsets = offsets ?? grids.map(() => ({ x: 0, y: 0, z: 0 }));
  const merged = mergeGrids(grids, gridOffsets); return { version: 1, grids: [merged], layers: [{ id: 'merged', name: 'Merged scene', visible: true, gridIndex: 0 }], entities: scenes.flatMap((scene) => scene.entities ?? []), metadata: { mergedScenes: scenes.length, sources: scenes.map((scene) => scene.metadata) } };
}


export function renameLayer(scene: SceneGraph, layerId: string, name: string): SceneGraph { const layers = (scene.layers ?? []).map((layer) => layer.id === layerId ? { ...layer, name: name.trim() || layer.name } : { ...layer }); return { ...scene, layers }; }export function setLayerVisibility(scene: SceneGraph, layerId: string, visible: boolean): SceneGraph {
  const layers = (scene.layers ?? scene.grids.map((_, index) => ({ id: `layer-${index}`, name: `Layer ${index + 1}`, visible: true, gridIndex: index }))).map((layer) => layer.id === layerId ? { ...layer, visible } : { ...layer });
  return { ...scene, layers };
}

export function visibleSceneGrids(scene: SceneGraph): BlockGrid[] {
  const layers = scene.layers ?? scene.grids.map((_, index) => ({ id: `layer-${index}`, name: `Layer ${index + 1}`, visible: true, gridIndex: index }));
  const visibleIndexes = new Set(layers.filter((layer) => layer.visible).map((layer) => layer.gridIndex));
  return scene.grids.filter((_, index) => visibleIndexes.has(index));
}


export function toggleLayerVisibility(scene: SceneGraph, layerId: string): SceneGraph {
  const layer = (scene.layers ?? []).find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`Scene layer '${layerId}' was not found.`);
  return setLayerVisibility(scene, layerId, !layer.visible);
}



