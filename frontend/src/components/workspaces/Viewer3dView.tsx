import React, { useState, useCallback, useEffect } from 'react';
import { LitematicaPlacementState, PlacementMirror, PlacementRotation, StructureData, VoxelBlock, VoxelRegion } from '../../types/minecraft';
import { downloadPlacements, normalizePlacement } from '../../integrations/placement';
import { ThreeViewport } from '../ThreeViewport';
import { BLOCK_REGISTRY } from '../../utils/blockRegistry';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Undo2,
  Redo2,
  Layers,
  Box,
  Plus,
  Trash2,
  Grid,
  Info,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

interface Viewer3dViewProps {
  structure: StructureData;
  onStructureChange: (newStructure: StructureData) => void;
  lang: 'zh' | 'en';
  initialHistory?: StructureData[];
  onHistoryChange?: (history: StructureData[]) => void;
  placements: LitematicaPlacementState[];
  onPlacementsChange: (placements: LitematicaPlacementState[]) => void;
}

export const Viewer3dView: React.FC<Viewer3dViewProps> = ({
  structure,
  onStructureChange,
  lang,
  initialHistory,
  onHistoryChange,
  placements,
  onPlacementsChange,
}) => {
  const [history, setHistory] = useState<StructureData[]>(initialHistory?.length ? initialHistory : [structure]);
  const [historyIndex, setHistoryIndex] = useState<number>(Math.max(0, (initialHistory?.length ?? 1) - 1));

  useEffect(() => { onHistoryChange?.(history); }, [history, onHistoryChange]);

  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [activePlacementIndex, setActivePlacementIndex] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<VoxelBlock | null>(null);
  const [nbtQuery, setNbtQuery] = useState('');
  const [nbtError, setNbtError] = useState<string | null>(null);

  const [minY, setMinY] = useState<number>(0);
  const [maxY, setMaxY] = useState<number>(structure.size.y);
  const [showRegions, setShowRegions] = useState<boolean>(true);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Responsive panel defaults: open on desktop, closed by default on small screens
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
  });
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 1280 : false;
  });

  const base = {
    en: {
      regionTree: 'Partitions (Region Tree)',
      selectionProps: 'Inspector & Transforms',
      undo: 'Undo',
      redo: 'Redo',
      rotate90: 'Rotate 90° (Y Axis)',
      mirrorX: 'Mirror (X Axis)',
      mirrorZ: 'Mirror (Z Axis)',
      sliceLayers: 'Layer Height Slice',
      addRegion: 'Add Partition',
      lock: 'Lock',
      unlock: 'Unlock',
      hide: 'Hide',
      show: 'Show',
      noBlockSelected: 'Click any voxel in the 3D viewport to inspect properties.',
      blockName: 'Voxel Spec',
      coords: 'Coordinates',
      category: 'Category',
      resistance: 'Blast Resistance',
      deleteRegion: 'Delete',
      grid: 'Grid',
      wireframe: 'Wireframe',
      transforms: 'Spatial Transformations',
      newRegionName: 'New Partition',
      openPartitions: 'Partitions',
      openInspector: 'Inspector',
    },
    zh: {
      regionTree: 'Region 分区层次树',
      selectionProps: '选区属性与空间变换',
      undo: '撤销',
      redo: '重做',
      rotate90: '绕 Y 轴顺时针旋转 90°',
      mirrorX: '沿 X 轴对称镜像',
      mirrorZ: '沿 Z 轴对称镜像',
      sliceLayers: '高度图层切片',
      addRegion: '新建分区',
      lock: '锁定',
      unlock: '解锁',
      hide: '隐藏',
      show: '显示',
      noBlockSelected: '在 3D 视口中点击任意体素即可检查其坐标与属性。',
      blockName: '方块物料',
      coords: '世界坐标',
      category: '材质类别',
      resistance: '爆炸抗性',
      deleteRegion: '删除',
      grid: '网格',
      wireframe: '线框',
      transforms: '空间几何变换',
      newRegionName: '新建分区',
      openPartitions: '分区树',
      openInspector: '检查器',
    },
  }[lang];
  const t = lang === 'zh' ? { ...base, regionTree: '区域树', selectionProps: '属性与变换', undo: '撤销', redo: '重做', rotate90: '绕 Y 轴旋转 90°', mirrorX: '沿 X 轴镜像', mirrorZ: '沿 Z 轴镜像', sliceLayers: '高度切片', addRegion: '添加区域', lock: '锁定', unlock: '解锁', hide: '隐藏', show: '显示', noBlockSelected: '点击 3D 视口中的方块查看属性。', blockName: '方块类型', coords: '坐标', category: '分类', resistance: '爆炸抗性', deleteRegion: '删除', grid: '网格', wireframe: '线框', transforms: '空间变换', newRegionName: '新区域', openPartitions: '区域', openInspector: '检查器' } : base;

  const commitChange = useCallback(
    (newStruct: StructureData) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newStruct);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      onStructureChange(newStruct);
    },
    [history, historyIndex, onStructureChange]
  );

  const handleUndo = () => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      onStructureChange(history[nextIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      onStructureChange(history[nextIdx]);
    }
  };

  const handleRotate90 = () => {
    const origSize = structure.size;
    const newSize = { x: origSize.z, y: origSize.y, z: origSize.x };

    const rotatedBlocks: VoxelBlock[] = structure.blocks.map((b) => ({
      x: origSize.z - 1 - b.z,
      y: b.y,
      z: b.x,
      blockId: b.blockId,
      state: b.state,
    }));

    const rotatedRegions: VoxelRegion[] = (structure.regions || []).map((r) => {
      const [minX, minYVal, minZ] = r.bounds.min;
      const [maxX, maxYVal, maxZ] = r.bounds.max;
      return {
        ...r,
        bounds: {
          min: [origSize.z - maxZ, minYVal, minX],
          max: [origSize.z - minZ, maxYVal, maxX],
        },
      };
    });

    commitChange({
      ...structure,
      size: newSize,
      blocks: rotatedBlocks,
      regions: rotatedRegions,
    });
  };

  const handleMirrorX = () => {
    const maxXCoord = structure.size.x - 1;
    const mirroredBlocks: VoxelBlock[] = structure.blocks.map((b) => ({
      x: maxXCoord - b.x,
      y: b.y,
      z: b.z,
      blockId: b.blockId,
      state: b.state,
    }));

    const mirroredRegions: VoxelRegion[] = (structure.regions || []).map((r) => {
      const [minX, minYVal, minZ] = r.bounds.min;
      const [maxX, maxYVal, maxZ] = r.bounds.max;
      return {
        ...r,
        bounds: {
          min: [structure.size.x - maxX, minYVal, minZ],
          max: [structure.size.x - minX, maxYVal, maxZ],
        },
      };
    });

    commitChange({
      ...structure,
      blocks: mirroredBlocks,
      regions: mirroredRegions,
    });
  };

  const handleMirrorZ = () => {
    const maxZCoord = structure.size.z - 1;
    const mirroredBlocks: VoxelBlock[] = structure.blocks.map((b) => ({
      x: b.x,
      y: b.y,
      z: maxZCoord - b.z,
      blockId: b.blockId,
      state: b.state,
    }));

    const mirroredRegions: VoxelRegion[] = (structure.regions || []).map((r) => {
      const [minX, minYVal, minZ] = r.bounds.min;
      const [maxX, maxYVal, maxZ] = r.bounds.max;
      return {
        ...r,
        bounds: {
          min: [minX, minYVal, structure.size.z - maxZ],
          max: [maxX, maxYVal, structure.size.z - minZ],
        },
      };
    });

    commitChange({
      ...structure,
      blocks: mirroredBlocks,
      regions: mirroredRegions,
    });
  };

  const toggleRegionVisibility = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = (structure.regions || []).map((r) =>
      r.id === id ? { ...r, visible: !r.visible } : r
    );
    commitChange({ ...structure, regions: updated });
  };

  const toggleRegionLock = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = (structure.regions || []).map((r) =>
      r.id === id ? { ...r, locked: !r.locked } : r
    );
    commitChange({ ...structure, regions: updated });
  };

  const handleAddRegion = () => {
    const newId = `reg_${Date.now()}`;
    const newReg: VoxelRegion = {
      id: newId,
      name: `${t.newRegionName} ${(structure.regions?.length || 0) + 1}`,
      bounds: {
        min: [0, 0, 0],
        max: [structure.size.x, structure.size.y, structure.size.z],
      },
      color: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'][
        (structure.regions?.length || 0) % 5
      ],
      visible: true,
      locked: false,
    };
    commitChange({
      ...structure,
      regions: [...(structure.regions || []), newReg],
    });
    setActiveRegionId(newId);
  };

  const handleDeleteRegion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = (structure.regions || []).filter((r) => r.id !== id);
    commitChange({ ...structure, regions: updated });
    if (activeRegionId === id) setActiveRegionId(null);
  };

  const activeRegion = (structure.regions || []).find((r) => r.id === activeRegionId);
  const selectedBlockMeta = selectedBlock ? BLOCK_REGISTRY[selectedBlock.blockId] : null;
  const entities = structure.metadata?.entities ?? [];
  const blockEntities = structure.metadata?.blockEntities ?? [];
  const filteredEntities = entities.filter((item) => JSON.stringify(item).toLowerCase().includes(nbtQuery.toLowerCase()));
  const filteredBlockEntities = blockEntities.filter((item) => JSON.stringify(item).toLowerCase().includes(nbtQuery.toLowerCase()));
  const updateNbt = (key: 'entities' | 'blockEntities', raw: string) => {
    try {
      const value = JSON.parse(raw);
      if (!Array.isArray(value)) throw new Error('NBT value must be an array.');
      setNbtError(null);
      commitChange({ ...structure, metadata: { ...(structure.metadata ?? {}), [key]: value } });
    } catch (error) { setNbtError(error instanceof Error ? error.message : 'Invalid NBT JSON.'); }
  };
  const updateNbtItem = (key: 'entities' | 'blockEntities', index: number, raw: string) => {
    try {
      const item = JSON.parse(raw);
      validateNbtEntry(item, key);
      const values = [...(structure.metadata?.[key] as unknown[] ?? [])];
      values[index] = item;
      setNbtError(null);
      commitChange({ ...structure, metadata: { ...(structure.metadata ?? {}), [key]: values } });
    } catch (error) { setNbtError(error instanceof Error ? error.message : 'Invalid NBT JSON.'); }
  };
  const addNbtItem = (key: 'entities' | 'blockEntities') => commitChange({ ...structure, metadata: { ...(structure.metadata ?? {}), [key]: [...(structure.metadata?.[key] as unknown[] ?? []), {}] } });
  const deleteNbtItem = (key: 'entities' | 'blockEntities', index: number) => commitChange({ ...structure, metadata: { ...(structure.metadata ?? {}), [key]: (structure.metadata?.[key] as unknown[] ?? []).filter((_, itemIndex) => itemIndex !== index) } });

  function validateNbtEntry(value: unknown, key: 'entities' | 'blockEntities') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('NBT entry must be a JSON object.');
    const entry = value as Record<string, unknown>;
    const id = entry.id ?? entry.Id ?? entry.ID ?? entry.type;
    if (id !== undefined && typeof id !== 'string') throw new Error(`${key} id/type must be a string.`);
    const position = entry.Pos ?? entry.pos ?? (entry.x !== undefined || entry.y !== undefined || entry.z !== undefined ? entry : undefined);
    if (position && typeof position !== 'object') throw new Error(`${key} position must be an object or list.`);
  }
  const activePlacement = placements[activePlacementIndex] ?? placements[0];
  const updatePlacement = (patch: Partial<LitematicaPlacementState>) => {
    const next = activePlacement ? { ...activePlacement, ...patch } : normalizePlacement({ name: structure.name, ...patch });
    const nextPlacements = placements.slice();
    if (activePlacementIndex >= nextPlacements.length) nextPlacements.push(next);
    else nextPlacements[activePlacementIndex] = next;
    onPlacementsChange(nextPlacements);
  };

  return (
    <div className="flex-1 h-full relative overflow-hidden flex bg-[#090a0f]">
      {/* 3D CAD Dominant Viewport */}
      <div className="flex-1 h-full relative">
        <ThreeViewport
          structure={structure}
          activeRegionId={activeRegionId}
          onSelectBlock={(b) => {
            setSelectedBlock(b);
            // On mobile, if a block is clicked, automatically open inspector
            if (b && window.innerWidth < 1024) {
              setIsRightPanelOpen(true);
            }
          }}
          minY={minY}
          maxY={maxY}
          showRegions={showRegions}
          wireframe={wireframe}
          showGrid={showGrid}
          className="w-full h-full"
        />

        {/* Floating Top CAD Spatial Toolbelt (Quick Actions) */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 studio-glass px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg shadow-2xl flex items-center gap-1 sm:gap-2 text-xs z-10 border border-white/[0.08] max-w-[calc(100%-120px)] overflow-x-auto">
          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 pr-1.5 border-r border-white/10 shrink-0">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 hover:bg-white/[0.08] transition-colors cursor-pointer"
              title={t.undo}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 hover:bg-white/[0.08] transition-colors cursor-pointer"
              title={t.redo}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Spatial Rotate & Mirror */}
          <button
            onClick={handleRotate90}
            className="px-2 py-1 rounded text-[11px] font-mono text-zinc-300 hover:text-white hover:bg-white/[0.08] flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
            title={t.rotate90}
          >
            <RotateCw className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">Rotate 90°</span>
            <span className="sm:hidden">90°</span>
          </button>

          <button
            onClick={handleMirrorX}
            className="px-2 py-1 rounded text-[11px] font-mono text-zinc-300 hover:text-white hover:bg-white/[0.08] flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
            title={t.mirrorX}
          >
            <FlipHorizontal className="w-3 h-3 text-sky-400" />
            <span className="hidden md:inline">Mirror X</span>
            <span className="md:hidden">X</span>
          </button>

          <button
            onClick={handleMirrorZ}
            className="px-2 py-1 rounded text-[11px] font-mono text-zinc-300 hover:text-white hover:bg-white/[0.08] flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
            title={t.mirrorZ}
          >
            <FlipVertical className="w-3 h-3 text-indigo-400" />
            <span className="hidden md:inline">Mirror Z</span>
            <span className="md:hidden">Z</span>
          </button>

          <div className="w-[1px] h-3.5 bg-white/10 shrink-0 mx-0.5" />

          {/* Grid & Wireframe */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`px-2 py-1 rounded text-[11px] font-mono shrink-0 transition-colors cursor-pointer ${
              showGrid ? 'bg-white/15 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
            title="Toggle CAD Grid"
          >
            {showGrid ? 'Grid: ON' : 'Grid: OFF'}
          </button>

          <button
            onClick={() => setWireframe(!wireframe)}
            className={`px-2 py-1 rounded text-[11px] font-mono shrink-0 transition-colors cursor-pointer ${
              wireframe ? 'bg-white/15 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
            title="Toggle Wireframe"
          >
            {wireframe ? 'Wire: ON' : 'Wire: OFF'}
          </button>
        </div>

        {/* Floating Bottom Viewport Controls (Responsive) */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 studio-glass px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg shadow-2xl flex items-center gap-3 sm:gap-4 text-xs z-10 border border-white/[0.08] max-w-[calc(100%-24px)] overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] sm:text-[11px] text-zinc-400 whitespace-nowrap">{t.sliceLayers}</span>
            <button
              onClick={() => setMaxY((prev) => Math.max(0, prev - 1))}
              className="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/15 text-zinc-300 flex items-center justify-center font-mono text-xs cursor-pointer"
              title="Previous Layer"
            >
              -
            </button>
            <input
              type="range"
              min={0}
              max={structure.size.y}
              value={maxY}
              onChange={(e) => setMaxY(Number(e.target.value))}
              className="w-24 sm:w-32 accent-white"
            />
            <button
              onClick={() => setMaxY((prev) => Math.min(structure.size.y, prev + 1))}
              className="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/15 text-zinc-300 flex items-center justify-center font-mono text-xs cursor-pointer"
              title="Next Layer"
            >
              +
            </button>
            <span className="font-mono text-[10px] sm:text-[11px] text-emerald-400 font-semibold w-10 tabular-nums">
              {maxY}/{structure.size.y}
            </span>
          </div>

          <div className="w-[1px] h-3.5 bg-white/10 shrink-0" />

          <button
            onClick={() => {
              setMinY(0);
              setMaxY(structure.size.y);
            }}
            className="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0 cursor-pointer"
          >
            {lang === 'zh' ? '显示全层' : 'Reset Slicer'}
          </button>
        </div>
      </div>

      {/* Mobile Backdrop Scrim when panels are open */}
      {(isLeftPanelOpen || isRightPanelOpen) && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-20 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => {
            setIsLeftPanelOpen(false);
            setIsRightPanelOpen(false);
          }}
        />
      )}

      {/* Left Dock: Region Hierarchy Tree (Adaptive width & smooth transition) */}
      <div
        className={`fixed lg:absolute top-0 bottom-0 left-0 z-30 w-[85vw] max-w-[280px] sm:w-72 bg-[#0c0e15]/95 backdrop-blur-2xl border-r border-white/[0.07] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-2xl ${
          isLeftPanelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs font-semibold text-white">{t.regionTree}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleAddRegion}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              title={t.addRegion}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsLeftPanelOpen(false)}
              className="p-1 rounded text-zinc-400 hover:text-white lg:hidden"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Region List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {(!structure.regions || structure.regions.length === 0) ? (
            <div className="p-4 text-center text-xs text-zinc-500">
              {lang === 'zh' ? '暂无分区，点击右上角新建' : 'No partitions defined.'}
            </div>
          ) : (
            structure.regions.map((reg) => {
              const isSelected = activeRegionId === reg.id;
              return (
                <div
                  key={reg.id}
                  data-region-id={reg.id}
                  data-region-name={reg.name}
                  onClick={() => setActiveRegionId(reg.id)}
                  className={`p-2.5 rounded-md cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-white/[0.08] border-white/20 text-white'
                      : 'bg-white/[0.02] border-transparent text-zinc-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: reg.color || '#3b82f6' }}
                      />
                      <span className="text-xs font-medium truncate">{reg.name}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => toggleRegionVisibility(reg.id, e)}
                        className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10"
                        title={reg.visible ? t.hide : t.show}
                      >
                        {reg.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-zinc-600" />}
                      </button>
                      <button
                        onClick={(e) => toggleRegionLock(reg.id, e)}
                        className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10"
                        title={reg.locked ? t.unlock : t.lock}
                      >
                        {reg.locked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3 text-zinc-600" />}
                      </button>
                      <button
                        onClick={(e) => handleDeleteRegion(reg.id, e)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/40"
                        title={t.deleteRegion}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-1 font-mono text-[10px] text-zinc-500 tabular-nums">
                    [{reg.bounds.min.join(',')}] → [{reg.bounds.max.join(',')}]
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Left Dock Toggle Trigger */}
      <button
        onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
        className="absolute top-3 left-3 z-30 p-1.5 rounded-md studio-glass text-zinc-300 hover:text-white transition-all shadow-xl"
        style={{
          transform: isLeftPanelOpen && typeof window !== 'undefined' && window.innerWidth >= 1024
            ? 'translateX(284px)'
            : 'translateX(0)',
        }}
        title={t.openPartitions}
      >
        {isLeftPanelOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {/* Right Dock: Selection Inspector & Geometric Transformations */}
      <div
        className={`fixed lg:absolute top-0 bottom-0 right-0 z-30 w-[85vw] max-w-[320px] sm:w-80 bg-[#0c0e15]/95 backdrop-blur-2xl border-l border-white/[0.07] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-2xl ${
          isRightPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs font-semibold text-white">{t.selectionProps}</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 hover:bg-white/[0.06] active:scale-95"
              title={t.undo}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 hover:bg-white/[0.06] active:scale-95"
              title={t.redo}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <span className="text-zinc-500 text-[10px] ml-1 tabular-nums">
              {historyIndex + 1}/{history.length}
            </span>
            <button
              onClick={() => setIsRightPanelOpen(false)}
              className="p-1 rounded text-zinc-400 hover:text-white ml-1 lg:hidden"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 sm:space-y-5">
          {/* Spatial Geometric Transformations */}
          <div className="space-y-2">
            <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              {t.transforms}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={handleRotate90}
                className="p-2 rounded border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.06] active:scale-[0.97] text-xs font-medium text-zinc-200 flex flex-col items-center gap-1 transition-all"
                title={t.rotate90}
              >
                <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-mono">90° Y</span>
              </button>
              <button
                onClick={handleMirrorX}
                className="p-2 rounded border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.06] active:scale-[0.97] text-xs font-medium text-zinc-200 flex flex-col items-center gap-1 transition-all"
                title={t.mirrorX}
              >
                <FlipHorizontal className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[10px] font-mono">Mirror X</span>
              </button>
              <button
                onClick={handleMirrorZ}
                className="p-2 rounded border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.06] active:scale-[0.97] text-xs font-medium text-zinc-200 flex flex-col items-center gap-1 transition-all"
                title={t.mirrorZ}
              >
                <FlipVertical className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[10px] font-mono">Mirror Z</span>
              </button>
            </div>
          </div>

          {/* Selected Voxel Properties */}
          <div className="space-y-2.5 pt-2 border-t border-white/[0.07]">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">{lang === 'zh' ? 'Litematica Placement' : 'Litematica Placement'}</div>
              <button type="button" onClick={() => downloadPlacements(placements, structure.name)} className="text-[10px] text-emerald-300 hover:text-white">JSON</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['x', 'y', 'z'] as const).map((axis) => <input key={axis} aria-label={`Placement ${axis}`} type="number" value={activePlacement?.position[axis] ?? 0} onChange={(e) => updatePlacement({ position: { ...(activePlacement?.position ?? { x: 0, y: 0, z: 0 }), [axis]: Number(e.target.value) } })} className="studio-input rounded px-2 py-1 text-xs" />)}
            </div>
            {placements.length > 0 && <div className="flex gap-1 overflow-x-auto pb-1">{placements.map((placement, index) => <button type="button" key={`${placement.name}-${index}`} onClick={() => setActivePlacementIndex(index)} className={`px-2 py-1 rounded border text-[10px] whitespace-nowrap ${index === activePlacementIndex ? 'border-emerald-400 text-emerald-300' : 'border-white/10 text-zinc-400'}`}>{placement.name}</button>)}</div>}
            <div className="grid grid-cols-2 gap-1.5">
              <select aria-label="Placement rotation" value={activePlacement?.rotation ?? 'none'} onChange={(e) => updatePlacement({ rotation: e.target.value as PlacementRotation })} className="studio-input rounded px-2 py-1 text-xs">
                <option value="none">None</option><option value="clockwise_90">90°</option><option value="180">180°</option><option value="counter_clockwise_90">-90°</option>
              </select>
              <select aria-label="Placement mirror" value={activePlacement?.mirror ?? 'none'} onChange={(e) => updatePlacement({ mirror: e.target.value as PlacementMirror })} className="studio-input rounded px-2 py-1 text-xs">
                <option value="none">No mirror</option><option value="front_back">Front/back</option><option value="left_right">Left/right</option>
              </select>
            </div>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => updatePlacement({ enabled: !(activePlacement?.enabled ?? true) })} className="px-2 py-1 border border-white/10 rounded">{activePlacement?.enabled === false ? 'Enable' : 'Enabled'}</button>
              <button type="button" onClick={() => updatePlacement({ locked: !(activePlacement?.locked ?? false) })} className="px-2 py-1 border border-white/10 rounded">{activePlacement?.locked ? 'Locked' : 'Unlocked'}</button>
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-white/[0.07]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">{lang === 'zh' ? '实体与方块实体' : 'Entities & block entities'}</div>
            <input value={nbtQuery} onChange={(event) => setNbtQuery(event.target.value)} placeholder={lang === 'zh' ? '搜索 NBT' : 'Search NBT'} className="studio-input w-full rounded px-2 py-1 text-xs" />
            {(['entities', 'blockEntities'] as const).map((key) => {
              const values = key === 'entities' ? filteredEntities : filteredBlockEntities;
              const source = key === 'entities' ? entities : blockEntities;
              return <details key={key}><summary className="cursor-pointer text-xs text-zinc-300">{key === 'entities' ? 'Entities' : 'BlockEntities'} ({values.length})</summary><div className="mt-1 space-y-1">{values.map((item) => { const sourceIndex = source.indexOf(item); return <div key={`${key}-${sourceIndex}`} className="flex gap-1"><textarea aria-label={`${key} ${sourceIndex}`} defaultValue={JSON.stringify(item, null, 2)} onBlur={(event) => updateNbtItem(key, sourceIndex, event.target.value)} className="w-full min-h-16 rounded border border-white/10 bg-black/20 p-2 text-[10px] text-zinc-400 font-mono" /><button type="button" onClick={() => deleteNbtItem(key, sourceIndex)} className="self-start px-1.5 py-1 text-[10px] text-red-300 border border-red-500/20 rounded">×</button></div>; })}<button type="button" onClick={() => addNbtItem(key)} className="px-2 py-1 text-[10px] border border-white/10 rounded text-zinc-300">+ Add</button></div></details>;
            })}
            {nbtError && <p role="alert" className="text-[10px] text-red-300">{nbtError}</p>}
          </div>

          {/* Selected Voxel Properties */}
          <div className="space-y-2.5 pt-2 border-t border-white/[0.07]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              {lang === 'zh' ? '体素实时属性' : 'Voxel Inspector'}
            </div>

            {selectedBlock ? (
              <div className="space-y-2.5 p-3 rounded-md border border-white/[0.08] bg-white/[0.02] animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-4 h-4 rounded-sm border border-white/20 shrink-0 shadow-sm"
                    style={{ backgroundColor: selectedBlockMeta?.color || '#71717a' }}
                  />
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {selectedBlockMeta?.name || selectedBlock.blockId}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500">{selectedBlock.blockId}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-white/[0.05]">
                  <div>
                    <div className="text-[10px] text-zinc-500">{t.coords}</div>
                    <div className="font-mono text-emerald-400 text-[11px] tabular-nums">
                      {selectedBlock.x}, {selectedBlock.y}, {selectedBlock.z}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">{t.category}</div>
                    <div className="text-zinc-300 text-[11px] capitalize">
                      {selectedBlockMeta?.category || 'Solid'}
                    </div>
                  </div>
                </div>

                {selectedBlockMeta?.blastResistance && (
                  <div className="text-xs pt-1 border-t border-white/[0.05]">
                    <div className="text-[10px] text-zinc-500">{t.resistance}</div>
                    <div className="font-mono text-zinc-300 text-[11px]">
                      {selectedBlockMeta.blastResistance}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded border border-dashed border-white/10 text-center text-xs text-zinc-500">
                {t.noBlockSelected}
              </div>
            )}
          </div>

          {/* Active Partition Properties */}
          {activeRegion && (
            <div className="space-y-2.5 pt-2 border-t border-white/[0.07]">
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                {lang === 'zh' ? '当前选中分区' : 'Active Partition'}
              </div>
              <div className="p-3 rounded-md border border-white/[0.08] bg-white/[0.02] space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: activeRegion.color || '#3b82f6' }}
                  />
                  <div className="text-xs font-medium text-white">{activeRegion.name}</div>
                </div>
                <div className="text-[11px] font-mono text-zinc-400 space-y-0.5 tabular-nums">
                  <div>Min: [{activeRegion.bounds.min.join(', ')}]</div>
                  <div>Max: [{activeRegion.bounds.max.join(', ')}]</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Dock Toggle Trigger */}
      <button
        onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
        className="absolute top-3 right-3 z-30 p-1.5 rounded-md studio-glass text-zinc-300 hover:text-white transition-all shadow-xl"
        style={{
          transform: isRightPanelOpen && typeof window !== 'undefined' && window.innerWidth >= 1280
            ? 'translateX(-328px)'
            : 'translateX(0)',
        }}
        title={t.openInspector}
      >
        {isRightPanelOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
