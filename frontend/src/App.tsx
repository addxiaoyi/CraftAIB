import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { CraftAibProject, LitematicaPlacementState, StructureData, WorkspaceId } from './types/minecraft';
import { normalizePlacement } from './integrations/placement';
import { tr } from './i18n';
import { createDefaultStructure } from './utils/sampleStructure';
import { exportLitematic } from './utils/exporters';
import { decodeStructureFile } from './integrations/engine';

// Workspace Views
const AiBuilderView = lazy(() => import('./components/workspaces/AiBuilderView').then((module) => ({ default: module.AiBuilderView })));
const Viewer3dView = lazy(() => import('./components/workspaces/Viewer3dView').then((module) => ({ default: module.Viewer3dView })));
const ProjectionsView = lazy(() => import('./components/workspaces/ProjectionsView').then((module) => ({ default: module.ProjectionsView })));
const MaterialsView = lazy(() => import('./components/workspaces/MaterialsView').then((module) => ({ default: module.MaterialsView })));
const PixelArtView = lazy(() => import('./components/workspaces/PixelArtView').then((module) => ({ default: module.PixelArtView })));
const MapArtView = lazy(() => import('./components/workspaces/MapArtView').then((module) => ({ default: module.MapArtView })));
const VoxelLabView = lazy(() => import('./components/workspaces/VoxelLabView').then((module) => ({ default: module.VoxelLabView })));
const GeoSceneView = lazy(() => import('./components/workspaces/GeoSceneView').then((module) => ({ default: module.GeoSceneView })));
const LegoLdrawView = lazy(() => import('./components/workspaces/LegoLdrawView').then((module) => ({ default: module.LegoLdrawView })));
const SettingsView = lazy(() => import('./components/workspaces/SettingsView').then((module) => ({ default: module.SettingsView })));

// Collaboration Components & Hooks

// Icons
import {
  Sparkles,
  Box,
  FileCode2,
  Package,
  Palette,
  Map,
  Boxes,
  Mountain,
  Blocks,
  Settings,
  Download,
  Menu,
  X,
  CheckCircle2,
  ChevronDown,
  Wrench,
} from 'lucide-react';

function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    if (key === 'craftaib.edit-history') {
      try { localStorage.removeItem(key); } catch { /* storage can remain unavailable */ }
    }
  }
}
export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(() => {
    const saved = localStorage.getItem('craftaib.active-workspace');
    return saved && ['ai_builder', 'viewer_3d', 'projections', 'materials', 'pixel_art', 'map_art', 'voxel_lab', 'geo_scene', 'lego_ldraw', 'settings'].includes(saved) ? saved as WorkspaceId : 'ai_builder';
  });
  const [lang, setLang] = useState<'zh' | 'en'>(() => {
    const saved = localStorage.getItem('craftaib.language');
    return saved === 'en' || saved === 'zh' ? saved : 'zh';
  });
  const [autoSave, setAutoSave] = useState<boolean>(() => localStorage.getItem('craftaib.auto-save') !== 'false');
  const [isToolboxOpen, setIsToolboxOpen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const i18n = tr(lang);
  const [aiMeta, setAiMeta] = useState<CraftAibProject['ai']>(() => {
    const saved = localStorage.getItem('craftaib.ai-meta');
    if (!saved) return { prompt: '' };
    try { return JSON.parse(saved) as CraftAibProject['ai']; } catch { return { prompt: '' }; }
  });
  const [editHistory, setEditHistory] = useState<StructureData[]>(() => {
    const saved = localStorage.getItem('craftaib.edit-history');
    if (!saved) return [];
    try { const value = JSON.parse(saved); return Array.isArray(value) ? value : []; } catch { return []; }
  });
  const [materialInventory, setMaterialInventory] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('craftaib.material-inventory');
    if (!saved) return {};
    try { return JSON.parse(saved) as Record<string, number>; } catch { return {}; }
  });
  const [placements, setPlacements] = useState<LitematicaPlacementState[]>(() => {
    const saved = localStorage.getItem('craftaib.placements');
    if (!saved) return [];
    try { const value = JSON.parse(saved); return Array.isArray(value) ? value.map(normalizePlacement) : []; } catch { return []; }
  });
  const updateAiMeta = useCallback((next: CraftAibProject['ai']) => {
    setAiMeta((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, []);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const [structure, setStructure] = useState<StructureData>(() => {
    const saved = localStorage.getItem('blockcraft_current_structure');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    return createDefaultStructure();
  });

  useEffect(() => {
    if (autoSave) safeStorageSet('blockcraft_current_structure', JSON.stringify(structure));
    safeStorageSet('craftaib.auto-save', String(autoSave));
  }, [autoSave, structure]);

  useEffect(() => {
    safeStorageSet('craftaib.active-workspace', activeWorkspace);
    safeStorageSet('craftaib.edit-history', JSON.stringify(editHistory.slice(-5)));
    safeStorageSet('craftaib.material-inventory', JSON.stringify(materialInventory));
    try {
      safeStorageSet('craftaib.ai-meta', JSON.stringify(aiMeta ?? { prompt: '' }));
    } catch {
      // Keep the structure snapshot usable when a large reference image exceeds localStorage quota.
      if (aiMeta?.referenceImage) safeStorageSet('craftaib.ai-meta', JSON.stringify({ ...aiMeta, referenceImage: undefined }));
    }
  }, [activeWorkspace, aiMeta, editHistory, materialInventory]);

  useEffect(() => {
    safeStorageSet('craftaib.placements', JSON.stringify(placements));
  }, [placements]);

  const handleLanguageChange = (next: 'zh' | 'en') => {
    setLang(next);
    safeStorageSet('craftaib.language', next);
  };

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const handleStructureChange = (newStructure: StructureData) => {
    setStructure(newStructure);
    if (autoSave) {
      safeStorageSet('blockcraft_current_structure', JSON.stringify(newStructure));
    }
    
  };

  const handleResetDefaults = () => {
    const def = createDefaultStructure();
    setStructure(def);
    safeStorageSet('blockcraft_current_structure', JSON.stringify(def));
    
    showToast(lang === 'zh' ? '已重置为默认建筑结构' : 'Reset to default structure');
  };

  const saveProject = () => {
    const project: CraftAibProject = { version: 1, activeWorkspace, language: lang, autoSave, structure, ai: aiMeta, history: editHistory, placements, materialInventory, savedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${structure.name || 'craftaib-project'}.craftaib.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const project = JSON.parse(await file.text()) as Partial<CraftAibProject>;
      if (project.version !== 1 || !project.structure?.size || !Array.isArray(project.structure.blocks)) throw new Error('Invalid CraftAIB project file.');
      setStructure(project.structure);
      setAiMeta(project.ai ?? { prompt: '' });
      setEditHistory(project.history ?? [project.structure]);
      setPlacements((project.placements ?? []).map(normalizePlacement));
      setMaterialInventory(project.materialInventory ?? {});
      if (project.language === 'zh' || project.language === 'en') handleLanguageChange(project.language);
      if (typeof project.autoSave === 'boolean') setAutoSave(project.autoSave);
      if (project.activeWorkspace && allNavItems.some((item) => item.id === project.activeWorkspace)) setActiveWorkspace(project.activeWorkspace);
      showToast(i18n.project.restored);
    } catch (error) {
      showToast(error instanceof Error ? error.message : i18n.project.invalid);
    } finally {
      event.target.value = '';
    }
  };

  const coreNavItems = [
    {
      id: 'ai_builder' as WorkspaceId,
      label: lang === 'zh' ? 'AI 建筑' : 'AI Architect',
      icon: Sparkles,
    },
    {
      id: 'viewer_3d' as WorkspaceId,
      label: lang === 'zh' ? '3D 查看器' : '3D Viewer',
      icon: Box,
    },
    {
      id: 'projections' as WorkspaceId,
      label: lang === 'zh' ? '投影转换' : 'Projections',
      icon: FileCode2,
    },
    {
      id: 'materials' as WorkspaceId,
      label: lang === 'zh' ? '材料清单' : 'Materials BOM',
      icon: Package,
    },
  ];

  const toolboxNavItems = [
    {
      id: 'pixel_art' as WorkspaceId,
      label: lang === 'zh' ? '图片转像素画' : 'Pixel Art',
      icon: Palette,
    },
    {
      id: 'map_art' as WorkspaceId,
      label: lang === 'zh' ? 'Map Art 地图画' : 'Map Art',
      icon: Map,
    },
    {
      id: 'voxel_lab' as WorkspaceId,
      label: lang === 'zh' ? 'Voxel 体素实验室' : 'Voxel Lab',
      icon: Boxes,
    },
    {
      id: 'geo_scene' as WorkspaceId,
      label: lang === 'zh' ? 'Geo Scene 地貌' : 'Geo Scene',
      icon: Mountain,
    },
    {
      id: 'lego_ldraw' as WorkspaceId,
      label: lang === 'zh' ? 'LEGO / LDraw' : 'LEGO LDraw',
      icon: Blocks,
    },
    {
      id: 'settings' as WorkspaceId,
      label: lang === 'zh' ? '系统设置' : 'Settings',
      icon: Settings,
    },
  ];

  const zhNavLabels: Partial<Record<WorkspaceId, string>> = {
    ai_builder: 'AI 建筑', viewer_3d: '3D 查看器', projections: '投影文件', materials: '材料清单',
    pixel_art: '图片像素画', map_art: '地图画', voxel_lab: '体素实验室', geo_scene: '地理场景',
    lego_ldraw: 'LEGO / LDraw', settings: '设置',
  };
  const localizedCoreNavItems = lang === 'zh' ? coreNavItems.map((item) => ({ ...item, label: zhNavLabels[item.id] ?? item.label })) : coreNavItems;
  const localizedToolboxNavItems = lang === 'zh' ? toolboxNavItems.map((item) => ({ ...item, label: zhNavLabels[item.id] ?? item.label })) : toolboxNavItems;
  const allNavItems = [...localizedCoreNavItems, ...localizedToolboxNavItems];
  const isToolboxActive = localizedToolboxNavItems.some((n) => n.id === activeWorkspace);
  const currentToolboxItem = localizedToolboxNavItems.find((n) => n.id === activeWorkspace);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#07090e] text-zinc-100 font-sans antialiased selection:bg-emerald-500/30 selection:text-white bg-radial-ambient">
      {/* =========================================================================
          TOP BAR CONTRACT (Luxury Minimalist Architectural CAD Workbench):
          [Brand Wordmark + Model Info] — [Segmented Workspace Switcher] — [Presence + Actions]
          ========================================================================= */}
      <header className="h-13 border-b border-white/[0.08] bg-[#0c0f17]/90 backdrop-blur-2xl flex items-center justify-between px-3.5 sm:px-5 lg:px-6 gap-3 z-40 shrink-0">
        {/* Zone 1: Geometric Wordmark & Model Context */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] lg:hidden transition-colors cursor-pointer"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setActiveWorkspace('ai_builder')}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
          >
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <Box className="w-3.5 h-3.5 text-zinc-950 stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold tracking-wider text-white uppercase whitespace-nowrap font-mono flex items-center gap-1.5">
                BLOCKCRAFT
                <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold">
                  CAD
                </span>
              </span>
            </div>
          </button>

          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-zinc-500 pl-3 border-l border-white/[0.08]">
            <span className="text-zinc-200 font-medium truncate max-w-[120px] md:max-w-[160px]">
              {structure.name}
            </span>
            <span>·</span>
            <span className="text-emerald-400 font-semibold tabular-nums flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {structure.blocks.length.toLocaleString()} voxels
            </span>
            <span className="hidden md:inline">·</span>
            <span className="tabular-nums hidden md:inline text-zinc-400">
              {structure.size.x}×{structure.size.y}×{structure.size.z}
            </span>
          </div>
        </div>

        {/* Zone 2: Minimal Segmented Workspace Switcher (Desktop) */}
        <nav className="hidden lg:flex items-center gap-1.5 text-xs">
          {/* Core Suite */}
          <div className="flex items-center bg-white/[0.03] border border-white/[0.07] rounded-md p-0.5">
            {localizedCoreNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeWorkspace === item.id;
              return (
                <button
                  key={item.id}
                  data-workspace-id={item.id}
                  onClick={() => setActiveWorkspace(item.id)}
                  className={`px-3 py-1 rounded-[4px] text-xs font-medium transition-all duration-150 flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-white/10 text-white shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Toolbox Dropdown */}
          <div className="relative">
            <button
              data-toolbox-toggle="true"
              onClick={() => setIsToolboxOpen(!isToolboxOpen)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border ${
                isToolboxActive
                  ? 'bg-white/10 border-white/20 text-white shadow-sm'
                  : 'bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`}
            >
              <Wrench className="w-3.5 h-3.5 text-zinc-500" />
              <span>
                {isToolboxActive && currentToolboxItem
                  ? currentToolboxItem.label
                  : lang === 'zh'
                  ? '工具箱'
                  : 'Toolbox'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {isToolboxOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsToolboxOpen(false)}
                />
                <div className="absolute top-full mt-1.5 right-0 z-40 w-48 bg-[#0c0e15]/95 backdrop-blur-2xl border border-white/[0.08] rounded-md shadow-2xl p-1 space-y-0.5 animate-fade-in">
                  {localizedToolboxNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeWorkspace === item.id;
                    return (
                      <button
                        key={item.id}
                        data-workspace-id={item.id}
                        onClick={() => {
                          setActiveWorkspace(item.id);
                          setIsToolboxOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs transition-colors ${
                          isActive
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </nav>

        {/* Zone 3: Presence & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Language Switch */}
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="px-2 py-1 rounded text-xs font-mono text-zinc-400 hover:text-white hover:bg-white/[0.05] border border-white/[0.06] transition-colors"
            title="Switch Language"
          >
            {lang === 'zh' ? 'EN' : '中'}
          </button>

          {/* Quick Settings Icon */}
          <button
            onClick={() => setActiveWorkspace('settings')}
            className={`p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors ${
              activeWorkspace === 'settings' ? 'text-white bg-white/10' : ''
            }`}
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button data-project-action="save" onClick={saveProject} className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-white/[0.05] border border-white/[0.06]" title={lang === 'zh' ? '保存项目' : 'Save project'}>
            {lang === 'zh' ? '保存' : 'Save'}
          </button>
          <button data-project-action="open" onClick={() => projectInputRef.current?.click()} className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-white/[0.05] border border-white/[0.06]" title={lang === 'zh' ? '打开项目' : 'Open project'}>
            {lang === 'zh' ? '打开' : 'Open'}
          </button>
          <input ref={projectInputRef} type="file" accept="application/json,.craftaib.json" onChange={openProject} hidden />

          {/* Primary Action Button */}
          <button
            onClick={() => {
              exportLitematic(structure);
              showToast(lang === 'zh' ? '已导出 Litematica 结构文件' : 'Exported Litematic file');
            }}
            className="px-2.5 sm:px-3 py-1.5 btn-primary rounded-md text-xs font-medium flex items-center gap-1.5 shadow-sm whitespace-nowrap active:scale-[0.98] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{lang === 'zh' ? '导出 Litematic' : 'Export Litematic'}</span>
            <span className="xs:hidden">.litematic</span>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu (Silky slide down) */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-b border-white/[0.08] bg-[#0c0e15]/98 backdrop-blur-2xl p-3 space-y-1 z-30 shadow-2xl animate-fade-in max-h-[80vh] overflow-y-auto">
          <div className="text-[10px] font-mono text-zinc-500 uppercase px-2 pb-1">Core Workspaces</div>
          {localizedCoreNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeWorkspace === item.id;
            return (
              <button
                key={item.id}
                data-workspace-id={item.id}
                onClick={() => {
                  setActiveWorkspace(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="text-[10px] font-mono text-zinc-500 uppercase px-2 pt-2 pb-1 border-t border-white/[0.06]">Toolbox Utilities</div>
          {localizedToolboxNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeWorkspace === item.id;
            return (
              <button
                key={item.id}
                data-workspace-id={item.id}
                onClick={() => {
                  setActiveWorkspace(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Full-Stage Workspace Canvas */}
      <main data-active-workspace={activeWorkspace} className="flex-1 h-full overflow-hidden flex flex-col bg-[#090a0f] relative">
        <Suspense fallback={<div className="flex-1 grid place-items-center text-xs text-zinc-400">Loading workspace...</div>}>
        {activeWorkspace === 'ai_builder' && (
          <AiBuilderView
            structure={structure}
            onStructureChange={handleStructureChange}
            initialAiMeta={aiMeta}
            onAiMetaChange={updateAiMeta}
            placements={placements}
            onNavigateTo3D={() => setActiveWorkspace('viewer_3d')}
            lang={lang}
          />
        )}

        {activeWorkspace === 'viewer_3d' && (
          <Viewer3dView
            structure={structure}
            onStructureChange={handleStructureChange}
            initialHistory={editHistory}
            onHistoryChange={setEditHistory}
            placements={placements}
            onPlacementsChange={setPlacements}
            lang={lang}
          />
        )}

        {activeWorkspace === 'projections' && (
          <ProjectionsView
            currentStructure={structure}
            onImportFile={decodeStructureFile}
            onLoadStructure={(s) => {
              handleStructureChange(s);
              setActiveWorkspace('viewer_3d');
              showToast(lang === 'zh' ? '已成功载入至 3D 查看器' : 'Loaded into 3D viewer');
            }}
            lang={lang}
            onPlacementsChange={setPlacements}
          />
        )}

        {activeWorkspace === 'materials' && (
          <MaterialsView
            structure={structure}
            onStructureChange={handleStructureChange}
            initialInventory={materialInventory}
            onInventoryChange={setMaterialInventory}
            lang={lang}
          />
        )}

        {activeWorkspace === 'pixel_art' && (
          <PixelArtView
            onLoadStructure={(s) => {
              handleStructureChange(s);
              setActiveWorkspace('viewer_3d');
              showToast(lang === 'zh' ? '像素画结构已生成并载入' : 'Pixel art structure synthesized');
            }}
            lang={lang}
          />
        )}

        {activeWorkspace === 'map_art' && (
          <MapArtView
            onLoadStructure={(s) => {
              handleStructureChange(s);
              setActiveWorkspace('viewer_3d');
              showToast(lang === 'zh' ? '地图画阶梯结构已生成并载入' : 'Map art staircase synthesized');
            }}
            lang={lang}
          />
        )}

        {activeWorkspace === 'voxel_lab' && (
          <VoxelLabView
            onLoadStructure={(s) => {
              handleStructureChange(s);
              setActiveWorkspace('viewer_3d');
              showToast(lang === 'zh' ? '体素几何体已载入至工作区' : 'Voxel geometry committed');
            }}
            lang={lang}
          />
        )}

        {activeWorkspace === 'geo_scene' && (
          <GeoSceneView
            onLoadStructure={(s) => {
              handleStructureChange(s);
              setActiveWorkspace('viewer_3d');
              showToast(lang === 'zh' ? '地形地貌场景已载入' : 'Geo terrain committed');
            }}
            lang={lang}
          />
        )}

        {activeWorkspace === 'lego_ldraw' && (
          <LegoLdrawView
            onLoadStructure={(s) => {
              handleStructureChange(s);
              setActiveWorkspace('viewer_3d');
              showToast(lang === 'zh' ? '乐高模型已转换为 Minecraft 结构' : 'LEGO converted to structure');
            }}
            lang={lang}
          />
        )}

        {activeWorkspace === 'settings' && (
          <SettingsView
            lang={lang}
            onLanguageChange={handleLanguageChange}
            autoSave={autoSave}
            onAutoSaveChange={setAutoSave}
            onResetDefaults={handleResetDefaults}
          />
        )}
        </Suspense>
      </main>

      {/* Floating Quiet Toast with Silky Slide Animation */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#0c0e15]/95 backdrop-blur-2xl text-zinc-200 text-xs px-3.5 py-2 rounded-md shadow-2xl flex items-center gap-2 border border-white/10 animate-fade-in">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
