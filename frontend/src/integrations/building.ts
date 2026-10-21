import type { NamedStructurePlan, StructureData } from '../types/minecraft';
import { gridToStructure, runEngineTask } from './engine';

type BuildOptions = {
  prompt: string;
  referenceImage?: string;
  type: string;
  style: string;
  floors?: number;
  width?: number;
  height?: number;
  length?: number;
  detailLevel?: number;
  includeInterior?: boolean;
  seed: number;
};

export type BuildProgress = (value: number, stage: string) => void;

export function compareReferenceSilhouette(structure: StructureData): number | undefined {
  const features = (structure.plan as any)?.referenceFeatures;
  if (!Array.isArray(features?.silhouette) || !features.silhouette.length || !structure.blocks.length) return undefined;
  const maxY = Math.max(1, structure.size.y - 1);
  const profile = features.silhouette.map((_: number, index: number) => {
    const x = Math.round(index * Math.max(0, structure.size.x - 1) / Math.max(1, features.silhouette.length - 1));
    const top = structure.blocks.filter((block) => Math.abs(block.x - x) <= 1).reduce((highest, block) => Math.max(highest, block.y), 0);
    return 1 - top / maxY;
  });
  const error = profile.reduce((sum: number, value: number, index: number) => sum + Math.abs(value - Number(features.silhouette[index] ?? value)), 0) / profile.length;
  return Math.max(0, Math.min(1, 1 - error));
}

export function compareReferenceProfiles(structure: StructureData): { frontScore?: number; sideScore?: number; roofScore?: number } {
  const features = (structure.plan as any)?.referenceFeatures;
  if (!Array.isArray(features?.silhouette) || !features.silhouette.length || !structure.blocks.length) return {};
  const maxY = Math.max(1, structure.size.y - 1);
  const score = (axis: 'x' | 'z') => {
    const span = axis === 'x' ? structure.size.x : structure.size.z;
    const profile = features.silhouette.map((_: number, index: number) => {
      const coordinate = Math.round(index * Math.max(0, span - 1) / Math.max(1, features.silhouette.length - 1));
      const top = structure.blocks.filter((block) => Math.abs(block[axis] - coordinate) <= 1).reduce((highest, block) => Math.max(highest, block.y), 0);
      return 1 - top / maxY;
    });
    const error = profile.reduce((sum: number, value: number, index: number) => sum + Math.abs(value - Number(features.silhouette[index] ?? value)), 0) / profile.length;
    return Math.max(0, Math.min(1, 1 - error));
  };
  const topBand = structure.blocks.filter((block) => block.y >= Math.max(0, structure.size.y - 3));
  const roofScore = topBand.length ? Math.min(1, topBand.length / Math.max(1, structure.size.x * structure.size.z * 0.12)) : 0;
  return { frontScore: score('x'), sideScore: score('z'), roofScore };
}

export async function generateBuilding(
  options: BuildOptions,
  signal: AbortSignal,
  onProgress?: BuildProgress,
  forceLocal = false,
): Promise<{ structure: StructureData; source: 'ai' | 'local' }> {
  const prompt = options.prompt.trim();
  if (!prompt && !options.referenceImage) throw new Error('Describe the building or add a reference image.');
  const referenceImage = options.referenceImage ? await imagePayload(options.referenceImage) : undefined;
  const constraints = { type: options.type, style: options.style, floors: options.floors || undefined, width: options.width || undefined, height: options.height || undefined, length: options.length || undefined, detailLevel: options.detailLevel || undefined, includeInterior: options.includeInterior !== false };
  const status = forceLocal ? null : await modelStatus(signal);
  const useVision = Boolean(referenceImage);
  const useModel = Boolean(useVision ? status?.vision : status?.text);
  const input = { prompt, seed: options.seed, constraints, referenceImage };

  if (useVision && !useModel && !forceLocal) {
    throw new Error('A vision model is required for strict reference-image generation. Choose local preview to use heuristic analysis.');
  }

  if (!useModel) {
    const localPrompt = [constraints.style, constraints.type, constraints.floors ? `${constraints.floors} floors` : "", constraints.width && constraints.height && constraints.length ? `${constraints.width} x ${constraints.height} x ${constraints.length} blocks` : "", constraints.detailLevel ? `detail level ${constraints.detailLevel} of 5` : "", constraints.includeInterior ? "furnished walkable interior with rooms and stairs" : "exterior only", prompt].filter(Boolean).join(", ");
    const planned = await runEngineTask<{ plan: NamedStructurePlan; grid: any; regions: Array<{ name: string; position: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }>; source: 'local' }>(
      'ai.local-structure-plan',
      { ...input, prompt: localPrompt },
      undefined,
      signal,
      onProgress,
    );
    return { structure: gridToStructure(planned.grid, { name: planned.plan.name, regions: planned.regions, plan: planned.plan }), source: 'local' };
  }

  const planned = await runEngineTask<{ plan: NamedStructurePlan; grid: any; regions: Array<{ name: string; position: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }>; source: 'ai' }>(
    'ai.structure-plan', input, undefined, signal, onProgress,
  );
  return { structure: gridToStructure(planned.grid, { name: planned.plan.name, regions: planned.regions, plan: planned.plan }), source: 'ai' };
}

async function modelStatus(signal: AbortSignal) {
  const response = await fetch('/api/ai/status', { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Model service status request failed (${response.status}).`);
  return response.json() as Promise<{ text: boolean; vision: boolean }>;
}

async function imagePayload(dataUrl: string) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const maxSide = 1536;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to prepare the reference image for the vision model.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  let compressed = canvas.toDataURL('image/jpeg', 0.82);
  if (compressed.length > 1_800_000) compressed = canvas.toDataURL('image/jpeg', 0.65);
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    dataUrl: compressed,
    sourceName: 'reference.jpg',
  };
}
