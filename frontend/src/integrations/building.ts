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

export type BuildProgress = (value: number, stage: string, log?: GenerationLogEntry) => void;
export type GenerationLogEntry = {
  at?: string;
  stage: string;
  turn?: number;
  tool?: string;
  ok?: boolean;
  blocks?: number;
  regions?: number;
  silhouette?: number;
  interiorBlocks?: number;
  interiorLights?: number;
  message?: string;
};

export function compareReferenceSilhouette(structure: StructureData): number | undefined {
  const match = structure.plan?.referenceValidation as { silhouette?: number } | undefined;
  return typeof match?.silhouette === 'number' ? match.silhouette : undefined;
}

export function compareReferenceProfiles(structure: StructureData): { frontScore?: number; sideScore?: number; roofScore?: number } {
  // One photograph does not supply independent side and roof ground truth.
  return { frontScore: compareReferenceSilhouette(structure) };
}

export async function generateBuilding(
  options: BuildOptions,
  signal: AbortSignal,
  onProgress?: BuildProgress,
  forceLocal = false,
): Promise<{ structure: StructureData; source: 'ai' | 'local'; generationLog: GenerationLogEntry[] }> {
  const prompt = options.prompt.trim();
  if (!prompt && !options.referenceImage) throw new Error('Describe the building or add a reference image.');
  const referenceImage = options.referenceImage ? await imagePayload(options.referenceImage) : undefined;
  const constraints = { type: options.type, style: options.style, floors: options.floors || undefined, width: options.width || undefined, height: options.height || undefined, length: options.length || undefined, sizeMode: referenceImage ? 'envelope' as const : 'exact' as const, detailLevel: options.detailLevel || undefined, includeInterior: options.includeInterior !== false };
  const status = forceLocal ? null : await modelStatus(signal);
  const hasReferenceImage = Boolean(referenceImage);
  const useModel = Boolean(status?.text);
  const input = { prompt, seed: options.seed, constraints, referenceImage };

  if (hasReferenceImage && !useModel && !forceLocal) {
    throw Object.assign(new Error('The unified building model is not configured. Configure it in Settings, or explicitly choose local preview.'), { code: 'MODEL_NOT_CONFIGURED' });
  }

  if (!useModel) {
    const localPrompt = [constraints.style, constraints.type, constraints.floors ? `${constraints.floors} floors` : "", constraints.width && constraints.height && constraints.length ? `${constraints.width} x ${constraints.height} x ${constraints.length} blocks` : "", constraints.detailLevel ? `detail level ${constraints.detailLevel} of 5` : "", constraints.includeInterior ? "furnished walkable interior with rooms and stairs" : "exterior only", prompt].filter(Boolean).join(", ");
    const planned = await runEngineTask<{ plan: NamedStructurePlan; grid: any; regions: Array<{ name: string; position: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }>; source: 'local'; generationLog?: GenerationLogEntry[] }>(
      'ai.local-structure-plan',
      { ...input, prompt: localPrompt },
      undefined,
      signal,
      onProgress,
    );
    return { structure: gridToStructure(planned.grid, { name: planned.plan.name, regions: planned.regions, plan: planned.plan }), source: 'local', generationLog: planned.generationLog ?? [] };
  }

  const planned = await runEngineTask<{ plan: NamedStructurePlan; grid: any; regions: Array<{ name: string; position: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }>; source: 'ai'; generationLog?: GenerationLogEntry[] }>(
    'ai.structure-plan', input, undefined, signal, onProgress,
  );
  return { structure: gridToStructure(planned.grid, { name: planned.plan.name, regions: planned.regions, plan: planned.plan }), source: 'ai', generationLog: planned.generationLog ?? [] };
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
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    dataUrl,
    sourceName: 'reference-image',
  };
}
