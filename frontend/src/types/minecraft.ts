export interface VoxelBlock {
  x: number;
  y: number;
  z: number;
  blockId: string;
  state?: Record<string, string>;
}

export type PlacementRotation = 'none' | 'clockwise_90' | '180' | 'counter_clockwise_90';
export type PlacementMirror = 'none' | 'front_back' | 'left_right';
export interface LitematicaPlacementState {
  name: string;
  schematic?: string;
  position: { x: number; y: number; z: number };
  enabled: boolean;
  locked: boolean;
  rotation: PlacementRotation;
  mirror: PlacementMirror;
  selectedRegion?: string;
}

export interface NamedStructurePlan {
  version: 1;
  name: string;
  regions: Array<{ name: string; role?: string; x: number; y: number; z: number; width: number; height: number; length: number }>;
  notes?: string[];
  inference?: { source: string; detectedType?: string; detectedStyle?: string; confidence?: number };
  [key: string]: unknown;
}

export interface VoxelRegion {
  id: string;
  name: string;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  locked: boolean;
  visible: boolean;
  color: string;
}

export interface StructureData {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  size: {
    x: number;
    y: number;
    z: number;
  };
  regions: VoxelRegion[];
  blocks: VoxelBlock[];
  createdAt?: string;
  plan?: NamedStructurePlan;
  metadata?: { entities?: unknown[]; blockEntities?: unknown[]; pendingBlockTicks?: unknown[]; placements?: unknown; [key: string]: unknown };
}

export interface CraftAibProject {
  version: 1;
  activeWorkspace: WorkspaceId;
  language: 'zh' | 'en';
  autoSave: boolean;
  structure: StructureData;
  ai?: { prompt: string; referenceImage?: string; source?: 'ai' | 'local'; referenceReport?: ReferenceReport };
  history?: StructureData[];
  placements?: LitematicaPlacementState[];
  materialInventory?: Record<string, number>;
  savedAt: string;
}

export interface ReferenceReport {
  subjectBounds?: { left: number; top: number; right: number; bottom: number };
  floors?: number;
  windowColumns?: number;
  towerColumns?: number;
  symmetry?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  silhouetteScore?: number;
  frontScore?: number;
  sideScore?: number;
  roofScore?: number;
  constructionReview?: {
    accepted: boolean;
    projectionAudits: Array<{ view: string; silhouette: number; missing: number; extra: number; depth: number; issues: string[] }>;
    interiorAudit?: { occupiedVoxels: number; volume: number; lights: number; connectedComponents: number; supports: number; openings: number };
    inferredHiddenGeometry?: string[];
    requiredRevision?: string[];
  };
}

export interface BlockMeta {
  id: string;
  name: string;
  color: string; // hex
  rgb: [number, number, number];
  category: 'stone' | 'wood' | 'mineral' | 'colored' | 'organic' | 'utility' | 'glass';
  flammable?: boolean;
  blastResistance?: number;
  litematicaCode?: string;
  mapBaseColor?: string;
  mapColorId?: number;
}

export interface MaterialItem {
  blockId: string;
  name: string;
  color: string;
  category: string;
  required: number;
  inventory: number;
  shortage: number;
  stacks: number;
  remainder: number;
  shulkers: number;
  substitutes: string[];
}

export type WorkspaceId =
  | 'ai_builder'
  | 'viewer_3d'
  | 'projections'
  | 'materials'
  | 'pixel_art'
  | 'map_art'
  | 'voxel_lab'
  | 'geo_scene'
  | 'lego_ldraw'
  | 'settings';
