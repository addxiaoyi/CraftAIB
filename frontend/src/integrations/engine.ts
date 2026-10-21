import type { StructureData, VoxelBlock, VoxelRegion } from '../types/minecraft';

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
  | { type: 'progress'; value: number; stage: string }
  | { type: 'result'; output: unknown }
  | { type: 'error'; code: string; message: string }
  | { type: 'cancelled' };

export type TaskProgress = (value: number, stage: string) => void;
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
    const cancel = () => worker.postMessage({ type: 'cancel', taskId: id });
    const fail = (error: Error) => {
      if (settled) return;
      finish();
      reject(error);
    };

    signal?.addEventListener('abort', cancel, { once: true });
    worker.onerror = (event) => fail(new Error(event.message || `Worker task failed: ${type}`));
    worker.onmessage = ({ data }: MessageEvent<WorkerEvent & { taskId?: string }>) => {
      if (data.taskId !== id || settled) return;
      if (data.type === 'progress') {
        onProgress?.(data.value, data.stage);
        return;
      }
      if (data.type === 'cancelled') {
        finish();
        reject(new DOMException('Task cancelled.', 'AbortError'));
        return;
      }
      if (data.type === 'error') {
        fail(Object.assign(new Error(data.message || `Worker task failed: ${data.code}`), { code: data.code }));
        return;
      }
      finish();
      resolve(data.output as T);
    };
    worker.postMessage({ id, type, input, options });
  });
}

export function structureToGrid(structure: StructureData): BlockGrid {
  const palette = new Map<string, BlockState>([['minecraft:air', { id: 'minecraft:air' }]]);
  const cells = structure.blocks.map((block) => {
    const state: BlockState = { id: normalizeBlockId(block.blockId), ...(block.state ? { properties: block.state } : {}) };
    palette.set(state.id, state);
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
    origin: { x: 0, y: 0, z: 0 },
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
      clamp(min[0] + Math.max(1, size.x), min[0] + 1, grid.width),
      clamp(min[1] + Math.max(1, size.y), min[1] + 1, grid.height),
      clamp(min[2] + Math.max(1, size.z), min[2] + 1, grid.length),
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
      runEngineTask<any>('litematic.inspect', bytes),
    ]);
    const regions = (info.regions ?? []).map((region: any) => ({
      name: region.name,
      position: { x: region.position.x - grid.origin.x, y: region.position.y - grid.origin.y, z: region.position.z - grid.origin.z },
      dimensions: region.dimensions,
    }));
    return gridToStructure(grid, { name: info.metadata?.name || file.name, author: info.metadata?.author, regions });
  }
  if (ext === 'schem' || ext === 'schematic') {
    const grid = await runEngineTask<BlockGrid>('schematic.parse', new Uint8Array(await file.arrayBuffer()));
    return gridToStructure(grid, { name: file.name.replace(/\.(schem|schematic)$/i, '') });
  }
  if (ext !== 'json') throw new Error('Choose a .litematic, .schem, or BlockGrid .json file.');
  const value = JSON.parse(await file.text());
  if (isBlockGrid(value)) return gridToStructure(value, { name: file.name.replace(/\.json$/i, '') });
  if (isStructureData(value)) return value;
  throw new Error('This JSON file is not a CraftAIB BlockGrid or structure project.');
}

function isBlockGrid(value: any): value is BlockGrid {
  return value?.version === 1 && value?.coordinateSystem === 'xyz' && Array.isArray(value?.cells) && Number.isInteger(value?.width);
}

function isStructureData(value: any): value is StructureData {
  return value?.size && Array.isArray(value?.blocks) && Array.isArray(value?.regions);
}

function normalizeBlockId(id: string) { return id.includes(':') ? id : `minecraft:${id}`; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Math.floor(value))); }
