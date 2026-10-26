import React, { useEffect, useRef, useState } from 'react';
import { unzipSync } from 'fflate';
import { BlockState, ThreeStructureRenderer, createResourcesFromPack, loadDefaultPackResources, type Resources, type StructureProvider } from '@mattzh72/lodestone';
import type { StructureData } from '../types/minecraft';
import { runEngineTask } from '../integrations/engine';

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

type PackAssets = { blockstates: Record<string, unknown>; models: Record<string, unknown>; textures: Record<string, [number, number, number, number]> };

async function decodePackResources(file: File, defaults: Awaited<ReturnType<typeof loadDefaultPackResources>>): Promise<Resources> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const find = (suffix: string) => Object.entries(files).find(([name]) => name.endsWith(suffix))?.[1];
  const readJson = (bytes: Uint8Array | undefined) => bytes ? JSON.parse(new TextDecoder().decode(bytes)) : undefined;
  const assets = JSON.parse(JSON.stringify(defaults.assets)) as PackAssets;

  for (const [name, bytes] of Object.entries(files)) {
    const match = name.match(/assets\/minecraft\/(blockstates|models)\/(.+)\.json$/);
    if (!match) continue;
    const key = match[2].replaceAll('\\', '/');
    const bucket = match[1] as 'blockstates' | 'models';
    assets[bucket][key] = JSON.parse(new TextDecoder().decode(bytes));
  }

  const customTextures = Object.entries(files).filter(([name]) => /assets\/minecraft\/textures\/block\/.+\.(png|mcmeta)$/.test(name) && !name.endsWith('.mcmeta'));
  if (!customTextures.length) return createResourcesFromPack({ assets, atlas: defaults.atlas });

  const tileSize = 32;
  const atlasSize = defaults.atlas.atlasSize * 2;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(atlasSize, atlasSize) : document.createElement('canvas');
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create a resource-pack atlas canvas.');
  const defaultCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(defaults.atlas.atlasSize, defaults.atlas.atlasSize) : document.createElement('canvas');
  defaultCanvas.width = defaults.atlas.atlasSize;
  defaultCanvas.height = defaults.atlas.atlasSize;
  const defaultContext = defaultCanvas.getContext('2d');
  if (!defaultContext) throw new Error('Unable to decode the bundled Minecraft atlas.');
  defaultContext.putImageData(defaults.atlas.imageData, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(defaultCanvas, 0, 0, atlasSize, atlasSize);

  let index = 0;
  for (const [name, bytes] of customTextures) {
    const image = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' }));
    const x = defaults.atlas.atlasSize + (index % 16) * tileSize;
    const y = Math.floor(index / 16) * tileSize;
    context.drawImage(image, x, y, tileSize, tileSize);
    image.close();
    const key = name.replace(/^.*assets\/minecraft\/textures\//, '').replace(/\.png$/, '').replaceAll('\\', '/');
    assets.textures[key] = [x, y, tileSize, tileSize];
    index += 1;
  }

  const imageData = context.getImageData(0, 0, atlasSize, atlasSize);
  const scaledTextures = Object.fromEntries(Object.entries(assets.textures).map(([key, [x, y, width, height]]) => [key, [x * 2, y * 2, width * 2, height * 2] as [number, number, number, number]])) as Record<string, [number, number, number, number]>;
  for (const [name] of customTextures) {
    const key = name.replace(/^.*assets\/minecraft\/textures\//, '').replace(/\.png$/, '').replaceAll('\\', '/');
    const [x, y, width, height] = assets.textures[key];
    scaledTextures[key] = [x, y, width, height];
  }
  return createResourcesFromPack({ assets: { ...assets, textures: scaledTextures }, atlas: { imageData, atlasSize } });
}

function pickBlock(structure: StructureData, camera: ReturnType<ThreeStructureRenderer['getCamera']>, x: number, y: number, width: number, height: number): { pos: [number, number, number]; normal: [number, number, number] } | null {
  const forward = [camera.target[0] - camera.position[0], camera.target[1] - camera.position[1], camera.target[2] - camera.position[2]];
  const forwardLength = Math.hypot(...forward) || 1;
  const f = forward.map((value) => value / forwardLength);
  const up = [0, 1, 0];
  const right = [f[2], 0, -f[0]];
  const rightLength = Math.hypot(...right) || 1;
  right[0] /= rightLength; right[2] /= rightLength;
  const upProjected = [f[1] * right[2], Math.sqrt(Math.max(0, 1 - f[1] * f[1])), -f[1] * right[0]];
  const nx = (x / width) * 2 - 1;
  const ny = 1 - (y / height) * 2;
  const aspect = width / Math.max(1, height);
  const scale = Math.tan((camera.fov * Math.PI) / 360);
  const direction = [f[0] + right[0] * nx * scale * aspect + upProjected[0] * ny * scale, f[1] + right[1] * nx * scale * aspect + upProjected[1] * ny * scale, f[2] + right[2] * nx * scale * aspect + upProjected[2] * ny * scale];
  const length = Math.hypot(...direction) || 1;
  let previous = '';
  for (let distance = 0; distance < Math.max(structure.size.x, structure.size.y, structure.size.z) * 4; distance += 0.18) {
    const px = Math.floor(camera.position[0] + direction[0] / length * distance);
    const py = Math.floor(camera.position[1] + direction[1] / length * distance);
    const pz = Math.floor(camera.position[2] + direction[2] / length * distance);
    const key = `${px},${py},${pz}`;
    if (key === previous) continue;
    const hit = structure.blocks.some((block) => block.x === px && block.y === py && block.z === pz && block.blockId !== 'minecraft:air');
    if (hit) {
      const prior = previous.split(',').map(Number);
      const normal: [number, number, number] = prior.length === 3 ? [prior[0] - px, prior[1] - py, prior[2] - pz] : [0, 0, 0];
      return { pos: [px, py, pz], normal };
    }
    previous = key;
  }
  return null;
}

export const LodestoneViewport: React.FC<{ structure: StructureData; className?: string; resourcePackFile?: File | null; onSelectBlock?: (block: StructureData['blocks'][number] | null) => void; onSelectFace?: (normal: [number, number, number] | null) => void }> = ({ structure, className = '', resourcePackFile, onSelectBlock, onSelectFace }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ThreeStructureRenderer | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState('Loading Minecraft resource pack...');
  const [pickedBlock, setPickedBlock] = useState<StructureData['blocks'][number] | null>(null);
  const [chunkCount, setChunkCount] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const provider = createProvider(structure);

    const start = async () => {
      try {
        const defaultPack = await loadDefaultPackResources({ baseUrl: `${window.location.origin}/lodestone-default-pack/` });
        const resources = resourcePackFile ? await decodePackResources(resourcePackFile, defaultPack) : defaultPack.resources;
        const index = await runEngineTask<{ chunkCount: number }>('viewer.chunk-index', { blocks: structure.blocks, chunkSize: 16 });
        if (!disposed) setChunkCount(index.chunkCount);
        if (disposed) return;
        const renderer = new ThreeStructureRenderer(canvas, provider, resources, {
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
        let frameId = 0;
        const draw = () => {
          if (disposed) return;
          renderer.drawStructure(renderer.getViewMatrix());
          frameId = requestAnimationFrame(draw);
        };
        draw();
        if (!disposed) setStatus('Minecraft resource pack ready');
        return () => {
          observer.disconnect();
          cancelAnimationFrame(frameId);
        };
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
  }, [structure, resourcePackFile]);

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
      onPointerMove={(event) => {
        if (event.altKey && rendererRef.current && onSelectBlock) {
          const rect = event.currentTarget.getBoundingClientRect();
          const hit = pickBlock(structure, rendererRef.current.getCamera(), event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
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
    <div data-lodestone-status={pickedBlock ? 'block-picked' : 'ready'} className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/55 px-2 py-1 text-[10px] text-zinc-300">{pickedBlock ? `${pickedBlock.blockId} @ ${pickedBlock.x}, ${pickedBlock.y}, ${pickedBlock.z}` : `${status}${chunkCount == null ? '' : ` · ${chunkCount} chunks`}`}</div>
  </div>;
};
