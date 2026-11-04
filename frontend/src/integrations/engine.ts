import type { StructureData, VoxelBlock, VoxelRegion } from '../types/minecraft';
import { parseProjectJson, validateProject, validateStructure } from './project';

type BlockState = { id: string; properties?: Record<string, string> };
export type BlockGrid = {
  version: 1;
  width: number;
  height: number;
  length: number;
  cells: Array<{ x: number; y: number; z: number; block: BlockState; source?: string }>;
  palette: BlockState[];
  coordinateSystem: 'xyz';
  origin: { x: number; y: number; z: number };
  metadata?: { entities?: unknown[]; blockEntities?: unknown[]; pendingBlockTicks?: unknown[]; placements?: unknown; [key: string]: unknown };
};

type WorkerEvent =
  | { type: 'progress'; value: number; stage: string; log?: TaskProgressLog }
  | { type: 'result'; output: unknown }
  | { type: 'error'; code: string; message: string; generationLog?: Array<Record<string, unknown>> }
  | { type: 'cancelled' };

export type TaskProgressLog = { stage: string; at?: string; turn?: number; tool?: string; ok?: boolean; blocks?: number; regions?: number; silhouette?: number; interiorBlocks?: number; interiorLights?: number; message?: string };
export type TaskProgress = (value: number, stage: string, log?: TaskProgressLog) => void;
const ENGINE_TASK_TIMEOUT_MS = 120000;
const MODEL_BUILD_TASK_TIMEOUT_MS = 960000;

export function runEngineTask<T>(
  type: string,
  input: unknown,
  options?: unknown,
  signal?: AbortSignal,
  onProgress?: TaskProgress,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('Task cancelled.', 'AbortError'));

  return new Promise<T>((resolve, reject) => {
    const worker = new Worker('/engine-worker.js', { type: 'module' });
    const id = `ui-${type.replaceAll('.', '-')}-${crypto.randomUUID()}`;
    let settled = false;
    const taskTimeoutMs = type === 'ai.structure-plan' ? MODEL_BUILD_TASK_TIMEOUT_MS : ENGINE_TASK_TIMEOUT_MS;
    const timeout = window.setTimeout(() => fail(new Error(`Engine task timed out: ${type}`)), taskTimeoutMs);

    const finish = () => {
      settled = true;
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      worker.terminate();
    };
    const cancel = () => {
      if (settled) return;
      // A busy voxel loop cannot receive a cancel message until it finishes.
      finish();
      reject(new DOMException('Task cancelled.', 'AbortError'));
    };
    const fail = (error: Error) => {
      if (settled) return;
      finish();
      reject(error);
    };

    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    worker.onerror = (event) => fail(new Error(event.message || `Worker task failed: ${type}`));
    worker.onmessage = ({ data }: MessageEvent<WorkerEvent & { taskId?: string }>) => {
      if (data.taskId !== id || settled) return;
      if (data.type === 'progress') {
        onProgress?.(data.value, data.stage, data.log);
        return;
      }
      if (data.type === 'cancelled') {
        finish();
        reject(new DOMException('Task cancelled.', 'AbortError'));
        return;
      }
      if (data.type === 'error') {
        fail(Object.assign(new Error(data.message || `Worker task failed: ${data.code}`), { code: data.code, generationLog: data.generationLog }));
        return;
      }
      finish();
      resolve(data.output as T);
    };
    worker.onmessageerror = () => fail(new Error(`Could not decode the engine response: ${type}`));
    try { worker.postMessage({ id, type, input, options }); } catch (error) {
      fail(error instanceof Error ? error : new Error(`Could not send the engine task: ${type}`));
    }
  });
}

export function structureToGrid(structure: StructureData): BlockGrid {
  const palette = new Map<string, BlockState>([['minecraft:air', { id: 'minecraft:air' }]]);
  const cells = structure.blocks.map((block) => {
    const state: BlockState = { id: normalizeBlockId(block.blockId), ...(block.state ? { properties: block.state } : {}) };
    const key = `${state.id}:${JSON.stringify(Object.entries(state.properties ?? {}).sort(([left], [right]) => left.localeCompare(right)))}`;
    palette.set(key, state);
    return { x: block.x, y: block.y, z: block.z, block: state, source: 'user' };
  });
  return {
    version: 1,
    width: structure.size.x,
    height: structure.size.y,
    length: structure.size.z,
    cells,
    palette: [...palette.values()],
    coordinateSystem: 'xyz',
    origin: structure.origin ?? { x: 0, y: 0, z: 0 },
    ...(structure.metadata ? { metadata: structure.metadata } : {}),
  };
}

export function gridToStructure(
  grid: BlockGrid,
  metadata: { name?: string; author?: string; description?: string; plan?: StructureData['plan']; regions?: Array<{ name: string; x?: number; y?: number; z?: number; width?: number; height?: number; length?: number; position?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number }; dimensions?: { x: number; y: number; z: number } }> } = {},
): StructureData {
  const colors = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#06b6d4', '#ef4444'];
  const regions: VoxelRegion[] = (metadata.regions?.length ? metadata.regions : [{
    name: 'Main structure', position: { x: 0, y: 0, z: 0 }, size: { x: grid.width, y: grid.height, z: grid.length },
  }]).map((region, index) => {
    const size = region.dimensions ?? region.size ?? {
      x: region.width ?? grid.width,
      y: region.height ?? grid.height,
      z: region.length ?? grid.length,
    };
    const pos = region.position ?? { x: region.x ?? 0, y: region.y ?? 0, z: region.z ?? 0 };
    const min = [clamp(pos.x, 0, grid.width - 1), clamp(pos.y, 0, grid.height - 1), clamp(pos.z, 0, grid.length - 1)] as [number, number, number];
    const max = [
      clamp(pos.x + Math.max(1, size.x), min[0] + 1, grid.width),
      clamp(pos.y + Math.max(1, size.y), min[1] + 1, grid.height),
      clamp(pos.z + Math.max(1, size.z), min[2] + 1, grid.length),
    ] as [number, number, number];
    return { id: `region-${index}`, name: region.name, bounds: { min, max }, locked: false, visible: true, color: colors[index % colors.length] };
  });

  const blocks: VoxelBlock[] = grid.cells
    .filter((cell) => normalizeBlockId(cell.block.id) !== 'minecraft:air')
    .map((cell) => ({ x: cell.x, y: cell.y, z: cell.z, blockId: normalizeBlockId(cell.block.id), ...(cell.block.properties ? { state: cell.block.properties } : {}) }));

  return {
    id: crypto.randomUUID(),
    name: metadata.name?.trim() || 'Untitled structure',
    author: metadata.author || 'CraftAIB',
    description: metadata.description || '',
    version: '1.20.4',
    size: { x: grid.width, y: grid.height, z: grid.length },
    origin: { ...grid.origin },
    regions,
    blocks,
    createdAt: new Date().toISOString(),
    ...(metadata.plan ? { plan: metadata.plan } : {}),
    ...(grid.metadata ? { metadata: grid.metadata } : {}),
  } as StructureData;
}

export async function decodeStructureFile(file: File): Promise<StructureData> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'litematic') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const [grid, info] = await Promise.all([
      runEngineTask<BlockGrid>('litematic.parse', bytes),
      runEngineTask<LitematicaSummary>('litematic.inspect', bytes),
    ]);
    const regions = info.regions.map((region) => ({
      name: region.name,
      position: {
        x: region.position.x + Math.min(0, region.size.x + 1) - grid.origin.x,
        y: region.position.y + Math.min(0, region.size.y + 1) - grid.origin.y,
        z: region.position.z + Math.min(0, region.size.z + 1) - grid.origin.z,
      },
      dimensions: region.dimensions,
    }));
    return gridToStructure(grid, { name: info.metadata?.name || file.name, author: info.metadata?.author, regions });
  }
  if (ext === 'schem' || ext === 'schematic') {
    const grid = await runEngineTask<BlockGrid>('schematic.parse', new Uint8Array(await file.arrayBuffer()));
    return gridToStructure(grid, { name: file.name.replace(/\.(schem|schematic)$/i, '') });
  }
  if (ext !== 'json') throw new Error('Choose a .litematic, .schem, or BlockGrid .json file.');
  const value = parseProjectJson(await file.text());
  if (isBlockGrid(value)) {
    await runEngineTask('grid.validate', value);
    return gridToStructure(value, { name: file.name.replace(/\.json$/i, '') });
  }
  if (value && typeof value === 'object' && 'structure' in value) return validateProject(value).structure;
  return validateStructure(value);
}

type Vec3 = { x: number; y: number; z: number };
type LitematicaSummary = {
  metadata: { name: string; author: string };
  regions: Array<{ name: string; position: Vec3; size: Vec3; dimensions: Vec3 }>;
};

function isBlockGrid(value: unknown): value is BlockGrid {
  return Boolean(value && typeof value === 'object' && 'coordinateSystem' in value && value.coordinateSystem === 'xyz');
}

function normalizeBlockId(id: string) { return id.includes(':') ? id : `minecraft:${id}`; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Math.floor(value))); }
