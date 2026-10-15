import React, { useState, useRef, useEffect } from 'react';
import { StructureData, VoxelBlock } from '../../types/minecraft';
import { applyMapArtStaircase, DitherAlgorithm } from '../../utils/dithering';
import { BLOCK_REGISTRY } from '../../utils/blockRegistry';
import { gridToStructure, runEngineTask } from '../../integrations/engine';
import { useEngineCommit } from '../../hooks/useEngineCommit';
import { tr } from '../../i18n';
import {
  Map,
  Upload,
  Sparkles,
  TrendingUp,
  Layers,
  Info,
} from 'lucide-react';

interface MapArtViewProps {
  onLoadStructure: (structure: StructureData) => void;
  lang: 'zh' | 'en';
}

export const MapArtView: React.FC<MapArtViewProps> = ({
  onLoadStructure,
  lang,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [mapSize, setMapSize] = useState<number>(128);
  const [mode, setMode] = useState<'staircase' | 'flat'>('staircase');
  const [algorithm, setAlgorithm] = useState<DitherAlgorithm>('floyd-steinberg');
  const [survivalMaterialsOnly, setSurvivalMaterialsOnly] = useState<boolean>(true);
  const [pixelsCount, setPixelsCount] = useState<number>(128 * 128);
  const engine = useEngineCommit();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const base = {
    en: {
      title: 'Minecraft Map Art Workbench',
      subtitle: 'Process 128×128 map item canvas with 3D staircase height shading for 3× richer color nuances.',
      uploadMapImage: 'Source Imagery',
      staircaseMode: '3D Staircase (阶梯算法)',
      flatMode: 'Flat 2D (水平模式)',
      staircaseDesc: 'Modulates block elevation (dy=±1) for bright, base, and shadowed shade variants per material.',
      flatDesc: 'Places all blocks on a single flat Y-plane without elevation shading.',
      mapSizeLabel: 'Map Item Frame Size',
      materialsFilter: 'Survival Accessible Materials',
      materialsDesc: 'Exclude creative-only, bedrock, barrier, and command blocks.',
      generateStructure: 'Synthesize 3D Map Art Structure',
      staircaseTitle: '3D Staircase Shading',
      flatTitle: 'Single Plane Surface',
    },
    zh: {
      title: 'Minecraft 地图画工作台 (Map Art)',
      subtitle: '针对 128×128 地图画网格进行阶梯算法优化，通过高低差 (dy=±1) 实现 3 倍高保真明暗色彩。',
      uploadMapImage: '地图原图输入',
      staircaseMode: '3D 阶梯算法 (推荐)',
      flatMode: '平铺模式 (平面)',
      staircaseDesc: '利用方块南北高低落差形成标准、明亮与阴影三重色调，大幅提升画质。',
      flatDesc: '所有方块置于同一高度 Y 平面，色彩均匀但无阴影纵深。',
      mapSizeLabel: '地图画画框规格',
      materialsFilter: '仅限生存模式常用建材',
      materialsDesc: '排除基岩、命令方块等不可获取材料，方便实装建造。',
      generateStructure: '合成 3D 地图画结构并载入',
      staircaseTitle: '3D 阶梯落差阴影解算',
      flatTitle: '平铺单层解算',
    },
  }[lang];
  const t = lang === 'zh' ? { ...base, title: tr(lang).pages.mapArt, subtitle: '将图片转换为带阶梯高度的 Minecraft 地图画。', uploadMapImage: '图片来源', staircaseMode: '3D 阶梯', flatMode: '平面模式', mapSizeLabel: '地图尺寸', materialsFilter: '仅使用生存材料', materialsDesc: '排除基岩、屏障和命令方块。', generateStructure: '生成地图画结构', staircaseTitle: '3D 阶梯阴影', flatTitle: '单平面表面' } : base;

  const getMapPalette = () => {
    const all = Object.keys(BLOCK_REGISTRY);
    if (survivalMaterialsOnly) {
      return all.filter(
        (k) =>
          k.includes('concrete') ||
          k.includes('terracotta') ||
          k.includes('wool') ||
          k.includes('stone') ||
          k.includes('dirt') ||
          k.includes('sand') ||
          k.includes('planks')
      );
    }
    return all;
  };

  const processMap = () => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;

    img.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = mapSize;
      offscreen.height = mapSize;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, mapSize, mapSize);
      const imgData = ctx.getImageData(0, 0, mapSize, mapSize);

      const palette = getMapPalette();
      const { pixels } = applyMapArtStaircase(imgData, palette, algorithm);
      setPixelsCount(pixels.length);

      if (canvasRef.current) {
        const preview = canvasRef.current;
        preview.width = mapSize * 3;
        preview.height = mapSize * 3;
        const pCtx = preview.getContext('2d');
        if (pCtx) {
          pCtx.imageSmoothingEnabled = false;
          pCtx.clearRect(0, 0, preview.width, preview.height);

          for (const p of pixels) {
            pCtx.fillStyle = p.block.color;
            pCtx.fillRect(p.x * 3, p.y * 3, 3, 3);
          }
        }
      }
    };
  };

  useEffect(() => {
    processMap();
  }, [imageSrc, mapSize, mode, algorithm, survivalMaterialsOnly]);

  useEffect(() => {
    const demo = document.createElement('canvas');
    demo.width = 128;
    demo.height = 128;
    const ctx = demo.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
      grad.addColorStop(0, '#f59e0b');
      grad.addColorStop(0.4, '#ef4444');
      grad.addColorStop(0.8, '#1e1b4b');
      grad.addColorStop(1, '#090a0f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(64, 64, 28, 0, Math.PI * 2);
      ctx.fill();

      setImageSrc(demo.toDataURL());
    }
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateStructure = () => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;

    img.onload = async () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = mapSize;
      offscreen.height = mapSize;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, mapSize, mapSize);
      const imgData = ctx.getImageData(0, 0, mapSize, mapSize);

      const palette = getMapPalette();
      const { pixels } = applyMapArtStaircase(imgData, palette, algorithm);

      const pixelMap = {
        width: mapSize,
        height: mapSize,
        paletteId: 'craftaib-map-art',
        pixels: Array.from(imgData.data).reduce<Array<{ r: number; g: number; b: number; a: number }>>((list, value, index, values) => {
          if (index % 4 === 0) list.push({ r: value, g: values[index + 1], b: values[index + 2], a: values[index + 3] });
          return list;
        }, []),
      };
      const workerPalette = palette.map((id) => ({ block: { id }, color: { r: BLOCK_REGISTRY[id].rgb[0], g: BLOCK_REGISTRY[id].rgb[1], b: BLOCK_REGISTRY[id].rgb[2] } }));
      const grid = await engine.run(async (signal, report) => runEngineTask<any>('map-art.generate', pixelMap, {
          palette: workerPalette,
          staircasing: mode === 'flat' ? 'none' : 'baseline',
          dither: algorithm !== 'nearest',
        }, signal, (_value, stage) => report(stage)));
      if (grid) onLoadStructure(gridToStructure(grid, { name: `Map Art (${mapSize}x${mapSize})`, description: 'Generated through the Cartographer map-art worker.' }));
      return;

      const blocks: VoxelBlock[] = [];
      let maxY = 0;

      if (mode === 'staircase') {
        for (const p of pixels) {
          const y = p.height || 10;
          if (y > maxY) maxY = y;
          blocks.push({
            x: p.x,
            y: y,
            z: p.y,
            blockId: p.block.id,
          });
        }
      } else {
        for (const p of pixels) {
          blocks.push({
            x: p.x,
            y: 0,
            z: p.y,
            blockId: p.block.id,
          });
        }
        maxY = 1;
      }

      const struct: StructureData = {
        id: 'mapart_' + Date.now(),
        name: `Map Art (${mapSize}×${mapSize})`,
        description: `Map Art generated using ${mode === 'staircase' ? '3D Staircase' : 'Flat'} algorithm.`,
        author: 'BlockCraft Map Art Studio',
        version: '1.20.4',
        size: {
          x: mapSize,
          y: Math.max(maxY + 2, 4),
          z: mapSize,
        },
        regions: [
          {
            id: 'reg_map',
            name: 'Map Art Region',
            bounds: {
              min: [0, 0, 0],
              max: [mapSize, Math.max(maxY + 2, 4), mapSize],
            },
            locked: false,
            visible: true,
            color: '#10B981',
          },
        ],
        blocks,
      };

      onLoadStructure(struct);
    };
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-5 lg:p-7 space-y-6 max-w-7xl mx-auto w-full bg-[#090a0f]">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold tracking-tight text-white">{t.title}</h1>
        <p className="text-xs text-zinc-400 mt-1">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Settings */}
        <div className="lg:col-span-5 bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 space-y-4">
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.uploadMapImage}</span>
            <label className="border border-dashed border-white/10 hover:border-white/20 rounded-md p-3.5 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white/[0.01]">
              <Upload className="w-4 h-4 text-zinc-400 mb-1" />
              <span className="text-xs text-zinc-300 font-medium">Upload Image</span>
              <span className="text-[10px] text-zinc-500 font-mono">1:1 Aspect ratio</span>
              <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">
              {lang === 'zh' ? '地图算法模式' : 'Mode'}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('staircase')}
                className={`p-2.5 rounded-md border text-left transition-colors ${
                  mode === 'staircase'
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Staircase (3D)</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                  3× shades (dy=±1)
                </div>
              </button>

              <button
                onClick={() => setMode('flat')}
                className={`p-2.5 rounded-md border text-left transition-colors ${
                  mode === 'flat'
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-400">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Flat (2D)</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                  Single Y level
                </div>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.mapSizeLabel}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMapSize(128)}
                className={`py-1.5 rounded-md text-xs font-mono border transition-colors ${
                  mapSize === 128
                    ? 'bg-white/10 border-white/20 text-white font-medium'
                    : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                }`}
              >
                128 × 128 (1 Map)
              </button>
              <button
                onClick={() => setMapSize(256)}
                className={`py-1.5 rounded-md text-xs font-mono border transition-colors ${
                  mapSize === 256
                    ? 'bg-white/10 border-white/20 text-white font-medium'
                    : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                }`}
              >
                256 × 256 (2×2 Maps)
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">Dithering</span>
            <select
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value as DitherAlgorithm)}
              className="w-full studio-input rounded-md px-2.5 py-1.5 text-xs bg-[#090a0f] text-white"
            >
              <option value="floyd-steinberg">Floyd-Steinberg Error Diffusion</option>
              <option value="atkinson">Atkinson Crisp Dither</option>
              <option value="nearest">Nearest Neighbor Quantization</option>
            </select>
          </div>

          <div className="p-3 bg-white/[0.02] rounded-md border border-white/[0.06] space-y-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-200">
              <input
                type="checkbox"
                checked={survivalMaterialsOnly}
                onChange={(e) => setSurvivalMaterialsOnly(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <span className="font-medium">{t.materialsFilter}</span>
            </label>
            <p className="text-[11px] text-zinc-500 ml-5">{t.materialsDesc}</p>
          </div>

          <button
            data-engine-commit="map-art"
            onClick={handleGenerateStructure}
            disabled={engine.isRunning}
            className="w-full py-2.5 px-4 rounded-md btn-primary text-xs font-semibold flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{engine.isRunning ? engine.progress : t.generateStructure}</span>
          </button>
          {engine.isRunning && <button type="button" onClick={engine.cancel} className="w-full mt-2 py-1.5 text-xs border border-white/10 rounded text-zinc-300">Cancel</button>}
          {engine.error && <p role="alert" className="text-xs text-red-300 mt-2">{engine.error}</p>}
        </div>

        {/* Right Column: High-Precision Map Frame Preview */}
        <div className="lg:col-span-7 bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 flex flex-col items-center justify-center min-h-[460px]">
          <div className="w-full flex items-center justify-between pb-3 border-b border-white/[0.06] text-xs">
            <span className="font-medium text-zinc-200">128×128 Map Frame Matrix</span>
            <span className="font-mono text-emerald-400 tabular-nums">
              {mapSize} × {mapSize} ({pixelsCount.toLocaleString()} voxels)
            </span>
          </div>

          <div className="p-3 bg-black/50 rounded-lg border border-white/[0.06] my-4 shadow-2xl flex items-center justify-center">
            <canvas
              ref={canvasRef}
              className="w-[360px] h-[360px] max-w-full rounded border border-white/10"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

          <div className="w-full bg-white/[0.02] border border-white/[0.06] rounded-md p-3 text-xs text-zinc-400 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-zinc-200">
                {mode === 'staircase' ? t.staircaseTitle : t.flatTitle}:
              </span>{' '}
              <span>{mode === 'staircase' ? t.staircaseDesc : t.flatDesc}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
