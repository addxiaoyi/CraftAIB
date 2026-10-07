import type { GeoRoad, GeoSceneInput } from './geo.js';

export function geoJsonToScene(input: unknown, options: Omit<GeoSceneInput, 'roads'>): GeoSceneInput {
  const root = input as any;
  const features = root?.type === 'FeatureCollection' ? root.features ?? [] : root?.type === 'Feature' ? [root] : [];
  const roads: GeoRoad[] = [];
  for (const feature of features) {
    const geometry = feature?.geometry;
    if (geometry?.type === 'LineString') roads.push({ nodes: geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })), surface: feature.properties?.surface, width: Number(feature.properties?.width) || undefined });
    if (geometry?.type === 'MultiLineString') for (const line of geometry.coordinates) roads.push({ nodes: line.map(([lng, lat]: [number, number]) => ({ lat, lng })), surface: feature.properties?.surface, width: Number(feature.properties?.width) || undefined });
  }
  return { ...options, roads };
}
