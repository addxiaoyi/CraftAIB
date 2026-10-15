export type BlockSource = 'voxelartcraft' | 'cartographer' | 'craftmatic' | 'user';

export type Rgba = { r: number; g: number; b: number; a: number };

export type ImageSource = {
  width: number;
  height: number;
  pixels: Uint8Array | ImageData;
  colorSpace?: 'srgb';
  sourceName?: string;
};

export type PixelMap = {
  width: number;
  height: number;
  pixels: Rgba[];
  paletteId: string;
};

export type BlockState = {
  id: string;
  properties?: Record<string, string>;
};

export type BlockCell = {
  x: number;
  y: number;
  z: number;
  block: BlockState;
  source?: BlockSource;
};

export type BlockGrid = {
  version: 1;
  width: number;
  height: number;
  length: number;
  cells: BlockCell[];
  palette: BlockState[];
  coordinateSystem: 'xyz';
  origin: { x: number; y: number; z: number };
  metadata?: {
    entities?: unknown[];
    blockEntities?: unknown[];
    pendingBlockTicks?: unknown[];
    placements?: unknown;
    [key: string]: unknown;
  };
};

export type SceneLayer = { id: string; name: string; visible: boolean; gridIndex: number; offset?: { x: number; y: number; z: number } };

export type SceneGraph = {
  version: 1;
  grids: BlockGrid[];
  layers?: SceneLayer[];
  entities?: unknown[];
  metadata: Record<string, unknown>;
};

export type EngineTask = {
  id: string;
  type: string;
  input: unknown;
  options?: unknown;
};

export type EngineEvent =
  | { type: 'progress'; taskId: string; value: number; stage: string }
  | { type: 'result'; taskId: string; output: unknown }
  | { type: 'error'; taskId: string; code: string; message: string }
  | { type: 'cancelled'; taskId: string };

export type ExportFormat = 'json' | 'nbt' | 'schem' | 'litematic' | 'png' | 'jpeg' | 'glb' | 'html';




