import { Box, Boxes, Blocks, FileCode2, Map, Mountain, Package, Palette, Settings, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WorkspaceId } from '../types/minecraft';

export type WorkspaceGroupId = 'core' | 'toolbox';

export interface WorkspaceNavItem {
  id: WorkspaceId;
  icon: LucideIcon;
}

export interface WorkspaceNavGroup {
  id: WorkspaceGroupId;
  items: readonly WorkspaceNavItem[];
}

export const WORKSPACE_GROUPS: readonly WorkspaceNavGroup[] = [
  {
    id: 'core',
    items: [
      { id: 'ai_builder', icon: Sparkles },
      { id: 'viewer_3d', icon: Box },
      { id: 'projections', icon: FileCode2 },
      { id: 'materials', icon: Package },
    ],
  },
  {
    id: 'toolbox',
    items: [
      { id: 'pixel_art', icon: Palette },
      { id: 'map_art', icon: Map },
      { id: 'voxel_lab', icon: Boxes },
      { id: 'geo_scene', icon: Mountain },
      { id: 'lego_ldraw', icon: Blocks },
      { id: 'settings', icon: Settings },
    ],
  },
];

export const WORKSPACE_ITEMS: readonly WorkspaceNavItem[] = WORKSPACE_GROUPS.flatMap((group) => group.items);
export const WORKSPACE_IDS: readonly WorkspaceId[] = WORKSPACE_ITEMS.map((item) => item.id);
const WORKSPACE_ID_SET: ReadonlySet<string> = new Set(WORKSPACE_IDS);

export function isWorkspaceId(value: string | null | undefined): value is WorkspaceId {
  return typeof value === 'string' && WORKSPACE_ID_SET.has(value);
}
