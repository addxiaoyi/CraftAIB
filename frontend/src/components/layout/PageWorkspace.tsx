import type { ReactNode } from 'react';

interface PageWorkspaceProps {
  title: string;
  subtitle?: string;
  status?: string;
  actions?: ReactNode;
  width?: 'wide' | 'narrow';
  children: ReactNode;
}

/**
 * Shared frame for scrollable tool pages: one title row, one content column.
 * Split-pane workspaces (AI builder, 3D viewer) manage their own frame.
 */
export function PageWorkspace({
  title,
  subtitle,
  status,
  actions,
  width = 'wide',
  children,
}: PageWorkspaceProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#090a0f]">
      <div
        className={`mx-auto w-full space-y-6 px-5 py-5 lg:px-7 lg:py-7 ${
          width === 'narrow' ? 'max-w-4xl' : 'max-w-7xl'
        }`}
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-white">{title}</h1>
            {subtitle && <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>}
            {status && (
              <p role="status" className="mt-1 font-mono text-[10px] text-zinc-500">
                {status}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
