import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BlockState, ThreeStructureRenderer, type StructureProvider } from '@mattzh72/lodestone';
import type { StructureData } from '../types/minecraft';
import { runEngineTask } from '../integrations/engine';
import { decodePackCached, loadDefaultPackCached } from '../integrations/resourcePack';
import { pickVoxel } from '../integrations/voxelPicking';

let rendererInstanceCounter = 0;
let packRequestCounter = 0;

function sizeKeyOf(structure: StructureData): string {
  return `${structure.size.x}x${structure.size.y}x${structure.size.z}`;
}

function createProvider(structure: StructureData): StructureProvider {
  const placed = structure.blocks.map((block) => ({
    pos: [block.x, block.y, block.z] as [number, number, number],
    state: new BlockState(block.blockId === 'minecraft:grass' ? 'minecraft:short_grass' : block.blockId, block.state),
  }));
  const byPosition = new Map(placed.map((block) => [block.pos.join(','), block]));
  return {
    getSize: () => [structure.size.x, structure.size.y, structure.size.z],
    getBlocks: () => placed,
    getBlock: (pos) => byPosition.get(pos.join(',')) ?? null,
  };
}

export const LodestoneViewport: React.FC<{ structure: StructureData; className?: string; resourcePackFile?: File | null; onSelectBlock?: (block: StructureData['blocks'][number] | null) => void; onSelectFace?: (normal: [number, number, number] | null) => void; backgroundColor?: string }> = ({ structure, className = '', resourcePackFile, onSelectBlock, onSelectFace, backgroundColor = '#101722' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const occupied = useMemo(() => new Set(structure.blocks.filter((block) => !['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air'].includes(block.blockId)).map((block) => `${block.x},${block.y},${block.z}`)), [structure.blocks]);
  const rendererRef = useRef<ThreeStructureRenderer | null>(null);
  const buildingRef = useRef(true);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const savedCameraRef = useRef<{ position: [number, number, number]; target: [number, number, number]; sizeKey: string } | null>(null);
  const statsTokenRef = useRef(0);
  const structureRef = useRef(structure);
  structureRef.current = structure;
  const rendererSizeKeyRef = useRef<string | null>(null);
  const [rendererEpoch, setRendererEpoch] = useState(0);
  const [status, setStatus] = useState('Loading Minecraft resource pack...');
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pickedBlock, setPickedBlock] = useState<StructureData['blocks'][number] | null>(null);
  const [meshStats, setMeshStats] = useState<{ chunkCount: number; faces: number; estimatedBytes: number } | null>(null);
  const statsTimerRef = useRef<number | undefined>(undefined);
  const retryResourcePack = () => setRendererEpoch((value) => value + 1);

  const scheduleMeshStats = (blocks: StructureData['blocks']) => {
    window.clearTimeout(statsTimerRef.current);
    const statsToken = ++statsTokenRef.current;
    statsTimerRef.current = window.setTimeout(() => {
      void runEngineTask<{ chunkCount: number; faces: number; estimatedBytes: number }>('viewer.mesh-index', { blocks, chunkSize: 16 })
        .then((index) => {
          if (statsToken === statsTokenRef.current) setMeshStats(index);
        })
        .catch((error) => {
          if (statsToken === statsTokenRef.current) setMeshStats(null);
          console.warn('LodestoneViewport mesh statistics failed', error);
        });
    }, 200);
  };

  const setView = (view: 'iso' | 'front' | 'side' | 'top') => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const size = Math.max(structure.size.x, structure.size.y, structure.size.z, 16);
    const center: [number, number, number] = [structure.size.x / 2, structure.size.y / 2, structure.size.z / 2];
    const position: [number, number, number] = view === 'front'
      ? [center[0], center[1], center[2] + size * 1.8]
      : view === 'side'
        ? [center[0] + size * 1.8, center[1], center[2]]
        : view === 'top'
          ? [center[0], center[1] + size * 2, center[2] + 0.01]
          : [center[0] + size * 1.3, center[1] + size, center[2] + size * 1.3];
    renderer.setCamera({ position, target: center });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.packRequest = String(++packRequestCounter);
    let disposed = false;
    let frameId = 0;
    let observer: ResizeObserver | undefined;
    let ownedRenderer: ThreeStructureRenderer | null = null;
    const release = () => {
      observer?.disconnect();
      cancelAnimationFrame(frameId);
      ownedRenderer?.dispose();
      if (rendererRef.current === ownedRenderer) rendererRef.current = null;
      ownedRenderer = null;
    };
    setPhase('loading');
    buildingRef.current = true;
    setPickedBlock(null);
    setStatus('Loading Minecraft resource pack...');

    const start = async () => {
      try {
        const baseUrl = `${window.location.origin}/lodestone-default-pack/`;
        const defaultPack = await loadDefaultPackCached(baseUrl);
        const resources = resourcePackFile ? await decodePackCached(resourcePackFile, defaultPack) : defaultPack.resources;
        if (disposed) return;
        const current = structureRef.current;
        const renderer = new ThreeStructureRenderer(canvas, createProvider(current), resources, {
          chunkSize: 16,
          asyncBuild: true,
          asyncChunkBuildTimeMs: 8,
          antialias: true,
          drawDistance: Math.max(current.size.x, current.size.y, current.size.z) * 4,
        });
        ownedRenderer = renderer;
        rendererRef.current = renderer;
        rendererSizeKeyRef.current = sizeKeyOf(current);
        canvas.dataset.lodestoneInstance = String(++rendererInstanceCounter);
        const resize = () => renderer.setViewport(0, 0, canvas.clientWidth || 800, canvas.clientHeight || 500, Math.min(window.devicePixelRatio, 2));
        observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();
        renderer.resetCamera();
        let build = renderer.whenReady();
        await build;
        while (!disposed && renderer.whenReady() !== build) {
          build = renderer.whenReady();
          await build;
        }
        if (disposed) return;
        buildingRef.current = false;
        const saved = savedCameraRef.current;
        if (saved && saved.sizeKey === rendererSizeKeyRef.current) renderer.setCamera({ position: saved.position, target: saved.target });
        const draw = () => {
          if (disposed) return;
          // Leave idle time for Lodestone's asynchronous chunk builder after edits.
          if (!buildingRef.current) renderer.drawStructure(renderer.getViewMatrix());
          frameId = requestAnimationFrame(draw);
        };
        draw();
        scheduleMeshStats(structureRef.current.blocks);
        setStatus('Minecraft resource pack ready');
        setPhase('ready');
      } catch (error) {
        if (!disposed) {
          release();
          console.error('LodestoneViewport resource pack failed', error);
          setPhase('error');
          setStatus(error instanceof Error ? `Resource pack could not load. ${error.message}` : 'Resource pack could not load. Check the pack and retry.');
        }
      }
    };
    void start();
    return () => {
      disposed = true;
      window.clearTimeout(statsTimerRef.current);
      statsTokenRef.current += 1;
      const active = ownedRenderer;
      if (active) {
        const camera = active.getCamera();
        savedCameraRef.current = {
          position: [camera.position[0], camera.position[1], camera.position[2]],
          target: [camera.target[0], camera.target[1], camera.target[2]],
          sizeKey: rendererSizeKeyRef.current ?? '',
        };
        rendererSizeKeyRef.current = null;
      }
      release();
    };
  }, [resourcePackFile, rendererEpoch]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const sizeKey = sizeKeyOf(structure);
    if (rendererSizeKeyRef.current !== sizeKey) {
      setRendererEpoch((value) => value + 1);
      return;
    }
    let obsolete = false;
    buildingRef.current = true;
    setPhase('loading');
    setPickedBlock(null);
    setStatus('Building Minecraft preview...');
    renderer.setStructure(createProvider(structure));
    rendererSizeKeyRef.current = sizeKey;
    scheduleMeshStats(structure.blocks);
    void renderer.whenReady().then(() => {
      if (obsolete || rendererRef.current !== renderer) return;
      buildingRef.current = false;
      setStatus('Minecraft resource pack ready');
      setPhase('ready');
    }).catch((error) => {
      if (obsolete || rendererRef.current !== renderer) return;
      console.error('LodestoneViewport structure rebuild failed', error);
      setStatus('Minecraft preview could not rebuild. Retry the preview.');
      setPhase('error');
    });
    return () => { obsolete = true; };
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

  return <div className={`relative overflow-hidden ${className}`} style={{ backgroundColor }}>
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none"
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY }; }}
      onPointerMove={(event) => {
        if (event.altKey && rendererRef.current && onSelectBlock) {
          const rect = event.currentTarget.getBoundingClientRect();
          const hit = pickVoxel(occupied, rendererRef.current.getCamera(), event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, Math.hypot(structure.size.x, structure.size.y, structure.size.z));
          const block = hit ? structure.blocks.find((value) => value.x === hit.pos[0] && value.y === hit.pos[1] && value.z === hit.pos[2]) ?? null : null;
          if (hit) rendererRef.current.drawOutline(hit.pos);
          setPickedBlock(block);
          onSelectFace?.(hit?.normal ?? null);
          onSelectBlock(block);
        }
        orbit(event);
      }}
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
    <div className="absolute bottom-3 right-3 flex gap-1 rounded bg-black/55 p-1 text-[10px] text-zinc-300">
      {(['iso', 'front', 'side', 'top'] as const).map((view) => <button key={view} data-lodestone-view={view} onClick={() => setView(view)} className="rounded px-1.5 py-0.5 hover:bg-white/20">{view}</button>)}
    </div>
    <div data-lodestone-status={phase === 'ready' && pickedBlock ? 'block-picked' : phase} role={phase === 'error' ? 'alert' : 'status'} className={phase === 'error' ? 'absolute left-1/2 top-1/2 z-20 flex w-max max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded bg-black/80 p-4 text-center text-xs text-zinc-300' : 'pointer-events-none absolute bottom-3 left-3 rounded bg-black/55 px-2 py-1 text-[10px] text-zinc-300'}>{phase === 'ready' && pickedBlock ? `${pickedBlock.blockId} @ ${pickedBlock.x}, ${pickedBlock.y}, ${pickedBlock.z}` : `${status}${meshStats == null ? '' : ` · ${meshStats.chunkCount} chunks · ${meshStats.faces.toLocaleString()} faces`}`}
      {phase === 'error' && <button type="button" data-resource-pack-retry="true" onClick={retryResourcePack} className="ml-2 rounded border border-white/20 px-2 py-1 text-white hover:bg-white/10">Retry resource pack</button>}
    </div>
  </div>;
};
