import type { NamedStructurePlan, StructureData } from '../types/minecraft';
import { gridToStructure, runEngineTask } from './engine';

type BuildOptions = {
  prompt: string;
  referenceImage?: string;
  type: string;
  style: string;
  floors: number;
  width: number;
  length: number;
  seed: number;
};

export type BuildProgress = (value: number, stage: string) => void;

export async function generateBuilding(
  options: BuildOptions,
  signal: AbortSignal,
  onProgress?: BuildProgress,
  forceLocal = false,
): Promise<{ structure: StructureData; source: 'ai' | 'local' }> {
  const prompt = options.prompt.trim();
  if (!prompt && !options.referenceImage) throw new Error('Describe the building or add a reference image.');
  const referenceImage = options.referenceImage ? await imagePayload(options.referenceImage) : undefined;
  const constraints = { type: options.type, style: options.style, floors: options.floors, width: options.width, length: options.length };
  const status = forceLocal ? null : await modelStatus(signal);
  const useVision = Boolean(referenceImage);
  const useModel = Boolean(useVision ? status?.vision : status?.text);
  const input = { prompt, seed: options.seed, constraints, referenceImage };

  if (useVision && !useModel && !forceLocal) {
    throw new Error('A vision model is required for strict reference-image generation. Choose local preview to use heuristic analysis.');
  }

  if (!useModel) {
    const localPrompt = [constraints.style, constraints.type, `${constraints.floors} floors`, `${constraints.width} x ${constraints.length}`, prompt].filter(Boolean).join(', ');
    const planned = await runEngineTask<{ plan: NamedStructurePlan; grid: any; source: 'local' }>(
      'ai.local-structure-plan',
      { ...input, prompt: localPrompt },
      undefined,
      signal,
      onProgress,
    );
    return { structure: gridToStructure(planned.grid, { name: planned.plan.name, regions: planned.plan.regions, plan: planned.plan }), source: 'local' };
  }

  const planned = await runEngineTask<{ plan: NamedStructurePlan; grid: any; source: 'ai' }>(
    'ai.structure-plan', input, undefined, signal, onProgress,
  );
  return { structure: gridToStructure(planned.grid, { name: planned.plan.name, regions: planned.plan.regions, plan: planned.plan }), source: 'ai' };
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
  const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Reference image could not be decoded.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data),
    dataUrl: canvas.toDataURL('image/jpeg', 0.82),
    sourceName: 'reference.jpg',
  };
}
