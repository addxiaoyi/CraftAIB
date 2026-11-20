import { useEffect, useRef } from 'react';
import type { StructureData } from '../types/minecraft';
import { BLOCK_REGISTRY } from '../utils/blockRegistry';

export type ThumbnailMode = 'front' | 'iso' | 'slice';
export type ThumbnailFacing = 'x-min' | 'x-max' | 'z-min' | 'z-max';

function blockColor(blockId: string): string {
  const registered = BLOCK_REGISTRY[blockId]?.color;
  if (registered) return registered;
  let hash = 0;
  for (const character of blockId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 30% 58%)`;
}

function drawThumbnail(canvas: HTMLCanvasElement, structure: StructureData, mode: ThumbnailMode, maxY: number, facing: ThumbnailFacing): void {
  const cssWidth = 180;
  const cssHeight = 88;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.aspectRatio = `${cssWidth} / ${cssHeight}`;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.fillStyle = '#111722';
  context.fillRect(0, 0, cssWidth, cssHeight);
  const source = structure.blocks;
  const stride = Math.max(1, Math.ceil(source.length / 9000));
  const cells = [] as typeof source;
  for (let index = 0; index < source.length; index += stride) {
    const block = source[index];
    const isAir = /^minecraft:(?:air|cave_air|void_air)$/.test(block.blockId);
    if (block.y <= maxY && !isAir) cells.push(block);
  }
  if (!cells.length) return;
  const minX = Math.min(...cells.map((cell) => cell.x));
  const maxX = Math.max(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const maxCellY = Math.max(...cells.map((cell) => cell.y));
  const minZ = Math.min(...cells.map((cell) => cell.z));
  const maxZ = Math.max(...cells.map((cell) => cell.z));
  const pad = 8;
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxCellY - minY + 1);
  const depth = Math.max(1, maxZ - minZ + 1);

  if (mode === 'front') {
    const face = new Map<string, StructureData['blocks'][number]>();
    const horizontalAxis = facing.startsWith('x') ? 'z' : 'x';
    const depthAxis = facing.startsWith('x') ? 'x' : 'z';
    const reverse = facing.endsWith('max');
    let horizontalMin = Infinity;
    let horizontalMax = -Infinity;
    for (const cell of cells) {
      const horizontal = cell[horizontalAxis];
      const depth = cell[depthAxis];
      horizontalMin = Math.min(horizontalMin, horizontal);
      horizontalMax = Math.max(horizontalMax, horizontal);
      const key = `${horizontal},${cell.y}`;
      const previous = face.get(key);
      if (!previous || (reverse ? depth > previous[depthAxis] : depth < previous[depthAxis])) face.set(key, cell);
    }
    const faceWidth = horizontalMax - horizontalMin + 1;
    const scale = Math.min((cssWidth - pad * 2) / faceWidth, (cssHeight - pad * 2) / height);
    const offsetX = (cssWidth - faceWidth * scale) / 2;
    const offsetY = (cssHeight - height * scale) / 2;
    for (const cell of face.values()) {
      const horizontal = cell[horizontalAxis];
      const localX = reverse ? horizontalMax - horizontal : horizontal - horizontalMin;
      context.fillStyle = blockColor(cell.blockId);
      context.fillRect(offsetX + localX * scale, offsetY + (maxCellY - cell.y) * scale, Math.max(1, scale + 0.3), Math.max(1, scale + 0.3));
    }
    return;
  }

  if (mode === 'slice') {
    const top = new Map<string, StructureData['blocks'][number]>();
    for (const cell of cells) {
      const key = `${cell.x},${cell.z}`;
      const previous = top.get(key);
      if (!previous || cell.y > previous.y) top.set(key, cell);
    }
    const scale = Math.min((cssWidth - pad * 2) / width, (cssHeight - pad * 2) / depth);
    const offsetX = (cssWidth - width * scale) / 2;
    const offsetY = (cssHeight - depth * scale) / 2;
    for (const cell of top.values()) {
      context.fillStyle = blockColor(cell.blockId);
      context.fillRect(offsetX + (cell.x - minX) * scale, offsetY + (cell.z - minZ) * scale, Math.max(1, scale + 0.3), Math.max(1, scale + 0.3));
    }
    return;
  }

  const projected = cells.map((cell) => ({
    cell,
    x: (cell.x - minX) - (cell.z - minZ),
    y: ((cell.x - minX) + (cell.z - minZ)) * 0.5 - (cell.y - minY),
    order: cell.x + cell.z + cell.y,
  })).sort((left, right) => left.order - right.order);
  const projectedWidth = width + depth;
  const projectedHeight = (width + depth) * 0.5 + height;
  const scale = Math.min((cssWidth - pad * 2) / projectedWidth, (cssHeight - pad * 2) / projectedHeight);
  const originX = cssWidth / 2;
  const originY = (cssHeight - projectedHeight * scale) / 2 + depth * 0.25 * scale;
  for (const item of projected) {
    const centerX = originX + item.x * scale * 0.78;
    const centerY = originY + item.y * scale * 0.78;
    const halfWidth = Math.max(1.2, scale * 0.42);
    const halfHeight = Math.max(1, scale * 0.22);
    context.fillStyle = blockColor(item.cell.blockId);
    context.beginPath();
    context.moveTo(centerX, centerY - halfHeight);
    context.lineTo(centerX + halfWidth, centerY);
    context.lineTo(centerX, centerY + halfHeight);
    context.lineTo(centerX - halfWidth, centerY);
    context.closePath();
    context.fill();
  }
}

export function VoxelThumbnail({ structure, mode, maxY, facing = 'z-min', label, onOpen, active = false }: { structure: StructureData; mode: ThumbnailMode; maxY: number; facing?: ThumbnailFacing; label: string; onOpen: () => void; active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) drawThumbnail(canvasRef.current, structure, mode, maxY, facing);
  }, [structure, mode, maxY, facing]);
  return (
    <button type="button" data-ai-thumbnail={mode} aria-pressed={active} onClick={onOpen} className="group min-w-0 text-left" title={label}>
      <span className={`block overflow-hidden rounded-md border bg-[#111722] ${active ? 'border-emerald-400/70' : 'border-white/[0.08] group-hover:border-emerald-400/50'}`}>
        <canvas ref={canvasRef} aria-label={label} className="block h-auto w-full" role="img" />
      </span>
      <span className="mt-1 block truncate text-[10px] text-zinc-400 group-hover:text-zinc-200">{label}</span>
    </button>
  );
}
