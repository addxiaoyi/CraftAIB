import type { BlockGrid, SceneGraph } from './types.js';
import { mergeGrids } from './merge.js';

function layersFor(scene: SceneGraph) { return scene.layers ?? scene.grids.map((_, index) => ({ id: `layer-${index}`, name: `Layer ${index + 1}`, visible: true, gridIndex: index })); }

export function mergeScenes(scenes: SceneGraph[], offsets?: Array<{ x: number; y: number; z: number }>): SceneGraph {
  if (!scenes.length) throw new Error('At least one SceneGraph is required.');
  const grids = scenes.flatMap((scene) => scene.grids); const gridOffsets = offsets ?? grids.map(() => ({ x: 0, y: 0, z: 0 })); const merged = mergeGrids(grids, gridOffsets);
  return { version: 1, grids: [merged], layers: [{ id: 'merged', name: 'Merged scene', visible: true, gridIndex: 0 }], entities: scenes.flatMap((scene) => scene.entities ?? []), metadata: { mergedScenes: scenes.length, sources: scenes.map((scene) => scene.metadata) } };
}

export function renameLayer(scene: SceneGraph, layerId: string, name: string): SceneGraph { return { ...scene, layers: layersFor(scene).map((layer) => layer.id === layerId ? { ...layer, name: name.trim() || layer.name } : { ...layer }) }; }
export function setLayerVisibility(scene: SceneGraph, layerId: string, visible: boolean): SceneGraph { return { ...scene, layers: layersFor(scene).map((layer) => layer.id === layerId ? { ...layer, visible } : { ...layer }) }; }
export function toggleLayerVisibility(scene: SceneGraph, layerId: string): SceneGraph { const layer = layersFor(scene).find((candidate) => candidate.id === layerId); if (!layer) throw new Error(`Scene layer '${layerId}' was not found.`); return setLayerVisibility(scene, layerId, !layer.visible); }
export function setLayerOffset(scene: SceneGraph, layerId: string, offset: { x: number; y: number; z: number }): SceneGraph { return { ...scene, layers: layersFor(scene).map((layer) => layer.id === layerId ? { ...layer, offset } : { ...layer }) }; }
export function visibleSceneGrids(scene: SceneGraph): BlockGrid[] { const layers = layersFor(scene); const visibleIndexes = new Set(layers.filter((layer) => layer.visible).map((layer) => layer.gridIndex)); return scene.grids.filter((_, index) => visibleIndexes.has(index)); }
export function sceneToGrid(scene: SceneGraph): BlockGrid { const layers = layersFor(scene).filter((layer) => layer.visible); const grids = layers.map((layer) => scene.grids[layer.gridIndex]).filter(Boolean); const offsets = layers.map((layer) => layer.offset ?? { x: 0, y: 0, z: 0 }); if (!grids.length) throw new Error('Scene has no visible layers.'); return mergeGrids(grids, offsets); }
