import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { WorkspaceId } from '../../types/minecraft';
import { tr } from '../../i18n';
import { WORKSPACE_GROUPS } from '../../layout/workspaces';

interface WorkspaceDrawerProps {
  lang: 'zh' | 'en';
  activeWorkspace: WorkspaceId;
  drawerId: string;
  drawerRef: RefObject<HTMLDivElement | null>;
  toggleRef: RefObject<HTMLButtonElement | null>;
  onSelectWorkspace: (id: WorkspaceId) => void;
  onClose: () => void;
}

export function WorkspaceDrawer({
  lang,
  activeWorkspace,
  drawerId,
  drawerRef,
  toggleRef,
  onSelectWorkspace,
  onClose,
}: WorkspaceDrawerProps) {
  const i18n = tr(lang);

  // Dialog contract: focus starts inside, Tab is trapped, Escape closes, focus returns to the toggle.
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusables = () =>
      Array.from(drawer.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.hasAttribute('disabled') && element.getBoundingClientRect().width > 0);

    focusables()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      toggleRef.current?.focus();
    };
  }, [drawerRef, toggleRef, onClose]);

  // The drawer only exists below lg; dismiss it when the viewport grows past that breakpoint.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const handleChange = () => {
      if (query.matches) onClose();
    };
    handleChange();
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [onClose]);

  return (
    <>
      <div
        data-mobile-drawer-backdrop="true"
        onClick={onClose}
        className="fixed inset-x-0 bottom-0 top-[var(--app-header-h)] z-[60] bg-black/55 backdrop-blur-[2px] animate-fade-in lg:hidden"
      />
      <div
        ref={drawerRef}
        id={drawerId}
        data-mobile-drawer="true"
        role="dialog"
        aria-modal="true"
        aria-label={i18n.layout.workspaces}
        className="studio-drawer fixed left-0 top-[var(--app-header-h)] z-[61] max-h-[calc(100dvh-var(--app-header-h)-8px)] w-[min(320px,calc(100vw-16px))] space-y-1 overflow-y-auto overscroll-contain p-3 animate-drawer-in lg:hidden"
      >
        {WORKSPACE_GROUPS.map((group) => {
          const headingId = `craftaib-drawer-${group.id}`;
          return (
          <div key={group.id} role="group" aria-labelledby={headingId} className="space-y-1">
            <div id={headingId} className={`px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 ${group.id === 'toolbox' ? 'border-t border-white/[0.06] pt-2' : ''}`}>
              {group.id === 'core' ? i18n.layout.coreWorkspaces : i18n.layout.toolboxUtilities}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeWorkspace === item.id;
              return (
                <button
                  key={item.id}
                  data-workspace-id={item.id}
                  onClick={() => {
                    onSelectWorkspace(item.id);
                    onClose();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-xs transition-colors ${
                    isActive
                      ? 'bg-white/10 font-medium text-white'
                      : 'text-zinc-400 hover:bg-white/[0.02] hover:text-white'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                  <span>{i18n.nav[item.id]}</span>
                </button>
              );
            })}
          </div>
          );
        })}
      </div>
    </>
  );
}
