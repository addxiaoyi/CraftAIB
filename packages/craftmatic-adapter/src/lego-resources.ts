export type LegoResource = { set_num: string; source: 'rebrickable' | 'omr' | 'local'; name?: string; partsUrl?: string; modelUrl?: string };
export type LegoModel = { set: LegoResource; bricks: import('./ldraw.js').LDrawBrick[]; scene: import('./lego-scene.js').LegoScene };

export function resolveLegoResource(set: LegoResource, sources: Record<string, LegoResource> = {}): LegoResource {
  const base = set.set_num.replace(/-\d+$/, '');
  return sources[set.set_num] ?? sources[base] ?? set;
}

export function createLegoModel(resource: LegoResource, bricks: import('./ldraw.js').LDrawBrick[], scene: import('./lego-scene.js').LegoScene): LegoModel { return { set: resolveLegoResource(resource), bricks, scene }; }
