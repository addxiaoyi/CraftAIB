import React, { useEffect, useRef, useState } from 'react';
import { BlockState, ThreeStructureRenderer, loadDefaultPackResources, type StructureProvider } from '@mattzh72/lodestone';
import type { StructureData } from '../types/minecraft';

function createProvider(structure: StructureData): StructureProvider {
  const placed = structure.blocks.map((block) => ({
    pos: [block.x, block.y, block.z] as [number, number, number],
    state: new BlockState(block.blockId, block.state),
  }));
  const byPosition = new Map(placed.map((block) => [block.pos.join(','), block]));
  return {
    getSize: () => [structure.size.x, structure.size.y, structure.size.z],
    getBlocks: () => placed,
    getBlock: (pos) => byPosition.get(pos.join(',')) ?? null,
  };
}

export const LodestoneViewport: React.FC<{ structure: StructureData; className?: string }> = ({ structure, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ThreeStructureRenderer | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState('Loading Minecraft resource pack...');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const provider = createProvider(structure);

    const start = async () => {
      try {
        const pack = await loadDefaultPackResources({ baseUrl: `${window.location.origin}/lodestone-default-pack/` });
        if (disposed) return;
        const renderer = new ThreeStructureRenderer(canvas, provider, pack.resources, {
          chunkSize: 16,
          asyncBuild: true,
          asyncChunkBuildTimeMs: 8,
          antialias: true,
          drawDistance: Math.max(structure.size.x, structure.size.y, structure.size.z) * 4,
        });
        rendererRef.current = renderer;
        const resize = () => renderer.setViewport(0, 0, canvas.clientWidth || 800, canvas.clientHeight || 500, Math.min(window.devicePixelRatio, 2));
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();
        renderer.resetCamera();
        await renderer.whenReady();
        if (!disposed) setStatus('Minecraft resource pack ready');
        return () => observer.disconnect();
      } catch (error) {
        if (!disposed) setStatus(error instanceof Error ? `Resource pack failed: ${error.message}` : 'Resource pack failed');
      }
    };
    let stop: (() => void) | undefined;
    void start().then((cleanup) => { stop = cleanup; });
    return () => {
      disposed = true;
      stop?.();
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [structure]);

  const orbit = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer || !dragRef.current) return;
    const camera = renderer.getCamera();
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    const position = [...camera.position] as [number, number, number];
    position[0] -= dx * 0.35;
    position[1] += dy * 0.35;
    position[2] -= dx * 0.35;
    renderer.setCamera({ position });
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  return <div className={`relative overflow-hidden bg-[#101722] ${className}`}>
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none"
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY }; }}
      onPointerMove={orbit}
      onPointerUp={() => { dragRef.current = null; }}
      onWheel={(event) => {
        const renderer = rendererRef.current;
        if (!renderer) return;
        const camera = renderer.getCamera();
        const factor = event.deltaY > 0 ? 1.08 : 0.92;
        const position = Array.from(camera.position, (value, index) => camera.target[index] + (value - camera.target[index]) * factor) as [number, number, number];
        renderer.setCamera({ position });
      }}
    />
    <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/55 px-2 py-1 text-[10px] text-zinc-300">{status}</div>
  </div>;
};
