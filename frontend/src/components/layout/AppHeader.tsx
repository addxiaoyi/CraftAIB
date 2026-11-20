import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Box, ChevronDown, Download, FolderOpen, Menu, Settings, Wrench, X } from 'lucide-react';
import type { WorkspaceId } from '../../types/minecraft';
import { tr } from '../../i18n';
import { WORKSPACE_GROUPS } from '../../layout/workspaces';

interface AppHeaderProps {
  lang: 'zh' | 'en';
  activeWorkspace: WorkspaceId;
  structureName: string;
  blockCount: number;
  size: { x: number; y: number; z: number };
  isDrawerOpen: boolean;
  drawerId: string;
  drawerToggleRef: RefObject<HTMLButtonElement | null>;
  onSelectWorkspace: (id: WorkspaceId) => void;
  onToggleDrawer: () => void;
  onToggleLanguage: () => void;
  onSaveProject: () => void;
  onOpenProject: () => void;
  onExportLitematic: () => void;
}

export function AppHeader({
  lang,
  activeWorkspace,
  structureName,
  blockCount,
  size,
  isDrawerOpen,
  drawerId,
  drawerToggleRef,
  onSelectWorkspace,
  onToggleDrawer,
  onToggleLanguage,
  onSaveProject,
  onOpenProject,
  onExportLitematic,
}: AppHeaderProps) {
  const i18n = tr(lang);
  const [isToolboxOpen, setIsToolboxOpen] = useState(false);
  const [isProjectOpen, setIsProjectOpen] = useState(false);
  const toolboxToggleRef = useRef<HTMLButtonElement>(null);
  const projectToggleRef = useRef<HTMLButtonElement>(null);
  const toolboxMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const coreItems = WORKSPACE_GROUPS[0].items;
  // Settings has a dedicated header button; the toolbox menu only lists tools.
  const toolboxItems = WORKSPACE_GROUPS[1].items.filter((item) => item.id !== 'settings');
  const currentToolboxItem = toolboxItems.find((item) => item.id === activeWorkspace);
  const isToolboxActive = Boolean(currentToolboxItem);
  // At icon-only widths the trigger must show which tool is active, not a generic wrench.
  const ToolboxIcon = currentToolboxItem?.icon ?? Wrench;

  // Menu contract: focus moves into the open menu, arrows rove, Escape closes and
  // returns focus to the trigger, Tab closes so the page keeps its normal order.
  useEffect(() => {
    const menu = isToolboxOpen ? toolboxMenuRef.current : isProjectOpen ? projectMenuRef.current : null;
    if (!menu) return;
    const trigger = isToolboxOpen ? toolboxToggleRef : projectToggleRef;
    const items = () => Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const close = () => {
      setIsToolboxOpen(false);
      setIsProjectOpen(false);
    };

    items()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        trigger.current?.focus();
        return;
      }
      if (event.key === 'Tab') {
        close();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const list = items();
      if (!list.length) return;
      event.preventDefault();
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? list.length - 1
          : event.key === 'ArrowDown'
            ? (index + 1) % list.length
            : (index - 1 + list.length) % list.length;
      list[next]?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isToolboxOpen, isProjectOpen]);

  useEffect(() => {
    setIsToolboxOpen(false);
    setIsProjectOpen(false);
  }, [activeWorkspace]);

  return (
    <header className="relative z-40 flex h-[var(--app-header-h)] shrink-0 items-center gap-3 overflow-visible border-b border-white/[0.08] bg-[#0c0f17]/95 px-3.5 backdrop-blur-2xl sm:px-5 lg:px-6">
      {/* Keyboard users land here before the workspace rail. */}
      <a
        href="#craftaib-main"
        className="pointer-events-none absolute left-3 top-[calc(var(--app-header-h)+8px)] z-[70] rounded-md border border-emerald-500/40 bg-[#0c0e15] px-3 py-1.5 text-xs text-white opacity-0 shadow-2xl focus:pointer-events-auto focus:opacity-100"
      >
        {i18n.layout.skipToContent}
      </a>

      {/* Zone 1: wordmark and current structure summary */}
      <div className="flex min-w-0 shrink-0 items-center gap-2.5 sm:gap-3.5">
        <button
          ref={drawerToggleRef}
          data-mobile-menu-toggle="true"
          onClick={onToggleDrawer}
          aria-expanded={isDrawerOpen}
          aria-controls={drawerId}
          aria-label={isDrawerOpen
            ? (lang === 'zh' ? '关闭工作区导航' : 'Close workspace navigation')
            : (lang === 'zh' ? '打开工作区导航' : 'Open workspace navigation')}
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
        >
          {isDrawerOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        <button onClick={() => onSelectWorkspace('ai_builder')} className="group flex items-center gap-2.5 text-left">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-500/20 transition-transform group-hover:scale-105">
            <Box className="h-3.5 w-3.5 stroke-[2.5] text-zinc-950" />
          </div>
          <div className="hidden min-[360px]:flex flex-col">
            <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-xs font-bold uppercase tracking-wider text-white">
              BLOCKCRAFT
              <span className="hidden rounded border border-emerald-500/30 bg-emerald-500/15 px-1 py-0.5 text-[11px] font-semibold text-emerald-400 sm:inline">CAD</span>
            </span>
          </div>
        </button>

        <div className="hidden items-center gap-2 border-l border-white/[0.08] pl-3 font-mono text-[11px] text-zinc-500 md:flex lg:hidden xl:flex">
          <span className="max-w-[120px] truncate font-medium text-zinc-200 md:max-w-[160px]">{structureName}</span>
          <span>·</span>
          <span className="flex items-center gap-1 font-semibold tabular-nums text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {blockCount.toLocaleString()} voxels
          </span>
          <span className="hidden xl:inline">·</span>
          <span className="hidden tabular-nums text-zinc-400 xl:inline">{size.x}×{size.y}×{size.z}</span>
        </div>
      </div>

      {/* Zone 2: workspace switcher. Icons from lg, labels from 2xl. */}
      <nav aria-label={i18n.layout.workspaces} className="hidden min-w-0 flex-1 items-center justify-center gap-2 text-xs lg:flex">
        <div className="flex min-w-0 items-center rounded-md border border-white/[0.07] bg-white/[0.03] p-0.5">
          {coreItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeWorkspace === item.id;
            const label = i18n.nav[item.id];
            return (
              <button
                key={item.id}
                data-workspace-id={item.id}
                onClick={() => onSelectWorkspace(item.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={label}
                title={label}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-xs)] px-2 py-1.5 text-xs font-medium transition-all duration-150 2xl:px-2.5 ${
                  isActive
                    ? 'bg-white/10 font-semibold text-white shadow-sm'
                    : 'text-zinc-400 hover:bg-white/[0.02] hover:text-zinc-200'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                <span className="hidden 2xl:inline">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative shrink-0">
          <button
            ref={toolboxToggleRef}
            data-toolbox-toggle="true"
            onClick={() => {
              setIsToolboxOpen((open) => !open);
              setIsProjectOpen(false);
            }}
            aria-expanded={isToolboxOpen}
            aria-haspopup="menu"
            aria-controls="craftaib-toolbox-menu"
            aria-label={currentToolboxItem ? i18n.nav[currentToolboxItem.id] : (lang === 'zh' ? '工具箱' : 'Toolbox')}
            title={currentToolboxItem ? i18n.nav[currentToolboxItem.id] : (lang === 'zh' ? '工具箱' : 'Toolbox')}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-all 2xl:px-3 ${
              isToolboxOpen
                ? 'border-white/20 bg-white/10 text-white shadow-sm'
                : isToolboxActive
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/[0.07] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
            }`}
          >
            <ToolboxIcon className={`h-3.5 w-3.5 ${isToolboxActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
            <span className="hidden 2xl:inline">{currentToolboxItem ? i18n.nav[currentToolboxItem.id] : (lang === 'zh' ? '工具箱' : 'Toolbox')}</span>
            <ChevronDown className="hidden h-3 w-3 text-zinc-500 2xl:block" />
          </button>

          {isToolboxOpen && (
            <>
              <div className="fixed inset-0 z-[45]" onClick={() => setIsToolboxOpen(false)} />
              <div ref={toolboxMenuRef} id="craftaib-toolbox-menu" role="menu" aria-label={lang === 'zh' ? '工具箱' : 'Toolbox'} className="absolute right-0 top-full z-[46] mt-1.5 w-52 space-y-0.5 rounded-md border border-white/[0.08] bg-[#0c0e15]/95 p-1 shadow-2xl backdrop-blur-2xl animate-fade-in">
                {toolboxItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeWorkspace === item.id;
                  return (
                    <button
                      key={item.id}
                      data-workspace-id={item.id}
                      onClick={() => {
                        onSelectWorkspace(item.id);
                        setIsToolboxOpen(false);
                        toolboxToggleRef.current?.focus();
                      }}
                      role="menuitem"
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs transition-colors ${
                        isActive
                          ? 'bg-white/10 font-medium text-white'
                          : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                      <span className="truncate">{i18n.nav[item.id]}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Zone 3: language, settings, project file actions, export */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          onClick={onToggleLanguage}
          className="rounded border border-white/[0.06] px-2 py-1 font-mono text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white"
          title="Switch Language"
          aria-label={lang === 'zh' ? '切换到英文' : 'Switch to Chinese'}
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>

        <button
          onClick={() => onSelectWorkspace('settings')}
          data-workspace-id="settings"
          className={`rounded p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white ${
            activeWorkspace === 'settings' ? 'bg-white/10 text-white' : ''
          }`}
          title="Settings"
          aria-label={i18n.nav.settings}
          aria-current={activeWorkspace === 'settings' ? 'page' : undefined}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        {/* Below xl the labelled Save/Open pair collapses into one menu. */}
        <div className="relative xl:hidden">
          <button
            ref={projectToggleRef}
            onClick={() => {
              setIsProjectOpen((open) => !open);
              setIsToolboxOpen(false);
            }}
            aria-expanded={isProjectOpen}
            aria-haspopup="menu"
            aria-controls="craftaib-project-menu"
            aria-label={i18n.layout.project}
            title={i18n.layout.project}
            className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
          {isProjectOpen && (
            <>
              <div className="fixed inset-0 z-[45]" onClick={() => setIsProjectOpen(false)} />
              <div ref={projectMenuRef} id="craftaib-project-menu" role="menu" aria-label={i18n.layout.project} className="absolute right-0 top-full z-[46] mt-1.5 w-40 space-y-0.5 rounded-md border border-white/[0.08] bg-[#0c0e15]/95 p-1 shadow-2xl backdrop-blur-2xl animate-fade-in">
                <button
                  role="menuitem"
                  data-project-action="save"
                  onClick={() => {
                    setIsProjectOpen(false);
                    projectToggleRef.current?.focus();
                    onSaveProject();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{i18n.project.save}</span>
                </button>
                <button
                  role="menuitem"
                  data-project-action="open"
                  onClick={() => {
                    setIsProjectOpen(false);
                    projectToggleRef.current?.focus();
                    onOpenProject();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span>{i18n.project.open}</span>
                </button>
              </div>
            </>
          )}
        </div>

        <button data-project-action="save" onClick={onSaveProject} className="hidden rounded border border-white/[0.06] px-2 py-1 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-white xl:flex" title={lang === 'zh' ? '保存项目' : 'Save project'}>
          {i18n.project.save}
        </button>
        <button data-project-action="open" onClick={onOpenProject} className="hidden rounded border border-white/[0.06] px-2 py-1 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-white xl:flex" title={lang === 'zh' ? '打开项目' : 'Open project'}>
          {i18n.project.open}
        </button>

        <button
          onClick={onExportLitematic}
          className="btn-primary flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm active:scale-[0.98] sm:px-3"
          title={lang === 'zh' ? '导出 Litematic' : 'Export Litematic'}
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span>.litematic</span>
        </button>
      </div>
    </header>
  );
}

export function HeaderToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border border-white/10 bg-[#0c0e15]/95 px-3.5 py-2 text-xs text-zinc-200 shadow-2xl backdrop-blur-2xl animate-fade-in">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      <span>{message}</span>
    </div>
  );
}
