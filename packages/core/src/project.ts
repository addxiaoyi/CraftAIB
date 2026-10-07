export type ProjectMode = 'image' | 'map-art' | 'voxel' | 'structure' | 'schematic' | 'viewer' | 'materials' | 'lego' | 'geo';
export type ProjectState = {
  version: 1; id: string; name: string; mode: ProjectMode;
  sourceImage?: { name?: string; width: number; height: number; mimeType?: string };
  imageAdjustments: Record<string, number | boolean>; selectedPalette: string[];
  grid?: import('./types.js').BlockGrid; scene?: import('./types.js').SceneGraph;
  materials: Record<string, number>; exports: Array<{ format: string; name: string; createdAt: string }>;
  updatedAt: string;
};
export function createProject(name = 'Untitled CraftAIB Project'): ProjectState {
  const now = new Date().toISOString();
  return { version: 1, id: globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`, name, mode: 'image', imageAdjustments: {}, selectedPalette: [], materials: {}, exports: [], updatedAt: now };
}
export function serializeProject(project: ProjectState): string { return JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, 2); }
export function parseProject(input: string): ProjectState {
  const parsed = JSON.parse(input) as Partial<ProjectState>;
  if (parsed.version !== 1 || typeof parsed.id !== 'string' || typeof parsed.name !== 'string' || !parsed.mode || !Array.isArray(parsed.selectedPalette) || !Array.isArray(parsed.exports)) throw new Error('Invalid CraftAIB project file.');
  return parsed as ProjectState;
}
