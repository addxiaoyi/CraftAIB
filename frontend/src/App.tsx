import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { CraftAibProject, LitematicaPlacementState, StructureData, WorkspaceId } from './types/minecraft';
import { tr } from './i18n';
import { createDefaultStructure } from './utils/sampleStructure';
import { exportLitematic } from './utils/exporters';
import { decodeStructureFile } from './integrations/engine';
import { AppHeader, HeaderToast } from './components/layout/AppHeader';
import { WorkspaceDrawer } from './components/layout/WorkspaceDrawer';
import { isWorkspaceId } from './layout/workspaces';
import { parseProjectJson, stringifyProjectJson, validateProject } from './integrations/project';
import { persistWorkbench, restoreWorkbench, saveReloadSnapshot, takeReloadSnapshot, type SavedWorkbench } from './integrations/storage';
import { ViewportReloadContext } from './components/ViewportReloadContext';

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

export default function App() {
  const [restored] = useState(() => {
    const saved = restoreWorkbench({ getItem: (key) => window.localStorage.getItem(key) });
    try {
      const snapshot = takeReloadSnapshot(window.sessionStorage);
      if (snapshot) return { ...snapshot, warnings: [] };
    } catch (error) {
      console.error('Workbench reload snapshot could not be restored', error);
      saved.warnings.push('Workbench reload snapshot could not be restored.');
    }
    return saved;
  });
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(restored.activeWorkspace);
  const [lang, setLang] = useState<'zh' | 'en'>(restored.language);
  const [autoSave, setAutoSave] = useState<boolean>(restored.autoSave);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState(restored.warnings.length > 0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportPending = useRef(false);
  const persisted = useRef<Partial<SavedWorkbench>>({});
  const [projectEpoch, setProjectEpoch] = useState(0);
  const i18n = tr(lang);
  const [aiMeta, setAiMeta] = useState<CraftAibProject['ai']>(restored.ai);
  const [editHistory, setEditHistory] = useState<StructureData[]>(restored.history ?? []);
  const [materialInventory, setMaterialInventory] = useState<Record<string, number>>(restored.materialInventory ?? {});
  const [placements, setPlacements] = useState<LitematicaPlacementState[]>(restored.placements ?? []);
  const updateAiMeta = useCallback((next: CraftAibProject['ai']) => {
    setAiMeta((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, []);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const [structure, setStructure] = useState<StructureData>(restored.structure);
  const reloadViewport = () => {
    saveReloadSnapshot(window.sessionStorage, { activeWorkspace, language: lang, autoSave, structure, ai: aiMeta, history: editHistory, materialInventory, placements });
    window.location.reload();
  };

  useEffect(() => {
    const warnings = persistWorkbench({
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: (key) => window.localStorage.removeItem(key),
    }, { activeWorkspace, language: lang, autoSave, structure, ai: aiMeta, history: editHistory, materialInventory, placements }, persisted.current);
    if (warnings.length) setStorageWarning(true);
  }, [activeWorkspace, lang, autoSave, structure, aiMeta, editHistory, materialInventory, placements]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const handleLanguageChange = (next: 'zh' | 'en') => {
    setLang(next);
  };

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 5000);
  }, []);

  const closeDrawer = useCallback(() => setIsMobileMenuOpen(false), []);

  const handleStructureChange = (newStructure: StructureData) => {
    setStructure(newStructure);
    if (newStructure.id !== structure.id) { setEditHistory([]); setPlacements([]); }
  };

  const handleResetDefaults = () => {
    const def = createDefaultStructure();
    setStructure(def);
    setEditHistory([]);
    setPlacements([]);
    showToast(lang === 'zh' ? '已重置为默认建筑结构' : 'Reset to default structure');
  };

  const saveProject = () => {
    const project: CraftAibProject = { version: 1, activeWorkspace, language: lang, autoSave, structure, ai: aiMeta, history: editHistory, placements, materialInventory, savedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([stringifyProjectJson(project, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${structure.name || 'craftaib-project'}.craftaib.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const project = validateProject(parseProjectJson(await file.text()));
      setProjectEpoch((epoch) => epoch + 1);
      setStructure(project.structure);
      setAiMeta(project.ai ?? { prompt: '' });
      setEditHistory(project.history ?? [project.structure]);
      setPlacements(project.placements ?? []);
      setMaterialInventory(project.materialInventory ?? {});
      if (project.language === 'zh' || project.language === 'en') handleLanguageChange(project.language);
      if (typeof project.autoSave === 'boolean') setAutoSave(project.autoSave);
      if (isWorkspaceId(project.activeWorkspace)) setActiveWorkspace(project.activeWorkspace);
      showToast(i18n.project.restored);
    } catch (error) {
      showToast(error instanceof Error ? error.message : i18n.project.invalid);
    } finally {
      event.target.value = '';
    }
  };

  const downloadLitematic = async () => {
    if (exportPending.current) return;
    exportPending.current = true;
    try {
      await exportLitematic(structure, placements);
      showToast(lang === 'zh' ? 'Litematic 文件已导出' : 'Litematic file exported');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Litematic export failed.');
    } finally { exportPending.current = false; }
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[var(--bg-canvas)] font-sans text-zinc-100 antialiased bg-radial-ambient selection:bg-emerald-500/30 selection:text-white">
      <AppHeader
        lang={lang}
        activeWorkspace={activeWorkspace}
        structureName={structure.name}
        blockCount={structure.blocks.length}
        size={structure.size}
        isDrawerOpen={isMobileMenuOpen}
        drawerId="craftaib-mobile-drawer"
        drawerToggleRef={mobileMenuToggleRef}
        onSelectWorkspace={setActiveWorkspace}
        onToggleDrawer={() => setIsMobileMenuOpen((open) => !open)}
        onToggleLanguage={() => handleLanguageChange(lang === 'zh' ? 'en' : 'zh')}
        onSaveProject={saveProject}
        onOpenProject={() => projectInputRef.current?.click()}
        onExportLitematic={downloadLitematic}
      />
      <input ref={projectInputRef} type="file" accept="application/json,.craftaib.json" onChange={openProject} hidden />
      {storageWarning && (
        <div role="alert" data-storage-warning className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-400/30 bg-amber-950 px-4 py-2 text-xs text-amber-100">
          <span>{lang === 'zh' ? '浏览器存储不可用、空间不足或保存内容损坏。请下载项目文件以保留当前工作。' : 'Browser storage is unavailable, full, or contains invalid saved content. Download the project to keep your work.'}</span>
          <button type="button" onClick={saveProject} className="shrink-0 underline">{lang === 'zh' ? '保存项目' : 'Save project'}</button>
        </div>
      )}

      {isMobileMenuOpen && (
        <WorkspaceDrawer
          lang={lang}
          activeWorkspace={activeWorkspace}
          drawerId="craftaib-mobile-drawer"
          drawerRef={mobileDrawerRef}
          toggleRef={mobileMenuToggleRef}
          onSelectWorkspace={setActiveWorkspace}
          onClose={closeDrawer}
        />
      )}

      <main id="craftaib-main" tabIndex={-1} data-active-workspace={activeWorkspace} className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#090a0f] focus:outline-none">
        <ViewportReloadContext.Provider value={reloadViewport}>
        <Suspense fallback={<div className="flex-1 grid place-items-center text-xs text-zinc-400">Loading workspace...</div>}>
        {activeWorkspace === 'ai_builder' && (
          <AiBuilderView
            key={projectEpoch}
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
            key={`${structure.id}:${projectEpoch}`}
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
        </ViewportReloadContext.Provider>
      </main>

      <HeaderToast message={toastMessage} />
    </div>
  );
}
