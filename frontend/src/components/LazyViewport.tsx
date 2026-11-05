import { Component, Suspense, lazy, useContext, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { ViewportReloadContext } from './ViewportReloadContext';

type Language = 'zh' | 'en';
type ViewportKind = 'solid' | 'textured';
type BoundaryProps = { children: ReactNode; kind: ViewportKind; lang: Language; onRetry: () => void };

function ViewportStatus({ failed = false, recoveryFailed = false, kind, lang, onRetry }: { failed?: boolean; recoveryFailed?: boolean; kind: ViewportKind; lang: Language; onRetry?: () => void }) {
  const message = lang === 'zh'
    ? failed ? '预览加载失败，请检查网络后重试。' : '正在加载 3D 预览…'
    : failed ? 'Preview could not load. Check your connection and retry.' : 'Loading 3D preview…';
  return (
    <div data-viewport-state={failed ? 'error' : 'loading'} data-viewport-kind={kind} role={failed ? 'alert' : 'status'} className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-xs text-zinc-400">
      <p>{message}</p>
      {recoveryFailed && <p data-viewport-recovery-error="true">{lang === 'zh' ? '当前工作无法暂存。请先导出项目，再手动刷新页面。' : 'Your work could not be saved for recovery. Export the project before refreshing.'}</p>}
      {failed && <button type="button" data-viewport-retry="true" onClick={onRetry} className="rounded border border-white/15 px-3 py-2 text-zinc-100 hover:bg-white/10">{lang === 'zh' ? '保留工作并重新加载' : 'Keep work and reload'}</button>}
    </div>
  );
}

class ViewportBoundary extends Component<BoundaryProps, { failed: boolean; recoveryFailed: boolean }> {
  state = { failed: false, recoveryFailed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`LazyViewport (${this.props.kind}) failed`, error, info.componentStack);
  }

  retry = () => {
    try {
      this.props.onRetry();
    } catch (error) {
      console.error('LazyViewport recovery snapshot failed', error);
      this.setState({ recoveryFailed: true });
    }
  };

  render() {
    if (this.state.failed) return <ViewportStatus failed recoveryFailed={this.state.recoveryFailed} kind={this.props.kind} lang={this.props.lang} onRetry={this.retry} />;
    return this.props.children;
  }
}

function lazyViewport<Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>, kind: ViewportKind) {
  const Renderer = lazy(load);
  return function DeferredViewport(props: Props & { lang?: Language }) {
    const reload = useContext(ViewportReloadContext);
    const lang = props.lang ?? 'en';
    const retry = () => {
      // Browsers cache failed module fetches, so retry through a saved page reload.
      if (!reload) throw new Error('Viewport recovery is unavailable outside the workbench.');
      reload();
    };
    return (
      <ViewportBoundary kind={kind} lang={lang} onRetry={retry}>
        <Suspense fallback={<ViewportStatus kind={kind} lang={lang} />}>
          <Renderer {...props} />
        </Suspense>
      </ViewportBoundary>
    );
  };
}

async function loadSolidViewport() {
  const { ThreeViewport } = await import('./ThreeViewport');
  return { default: ThreeViewport };
}

async function loadTexturedViewport() {
  const { LodestoneViewport } = await import('./LodestoneViewport');
  return { default: LodestoneViewport };
}

export const ThreeViewport = lazyViewport(loadSolidViewport, 'solid');
export const LodestoneViewport = lazyViewport(loadTexturedViewport, 'textured');
