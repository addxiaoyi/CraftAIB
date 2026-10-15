import React, { useState, useRef, useEffect } from 'react';
import { StructureData, VoxelBlock } from '../../types/minecraft';
import { processImageToPixelArt, DitherAlgorithm, ProcessedPixel } from '../../utils/dithering';
import { BLOCK_REGISTRY } from '../../utils/blockRegistry';
import { gridToStructure, runEngineTask } from '../../integrations/engine';
import {
  Palette,
  Upload,
  Sparkles,
  Layers,
  ArrowRight,
  Maximize2,
} from 'lucide-react';

interface PixelArtViewProps {
  onLoadStructure: (structure: StructureData) => void;
  lang: 'zh' | 'en';
}

export const PixelArtView: React.FC<PixelArtViewProps> = ({
  onLoadStructure,
  lang,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [resolution, setResolution] = useState<number>(32);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [paletteType, setPaletteType] = useState<string>('concrete');
  const [algorithm, setAlgorithm] = useState<DitherAlgorithm>('floyd-steinberg');
  const [processedPixels, setProcessedPixels] = useState<ProcessedPixel[]>([]);
  const [buildOrientation, setBuildOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const t = {
    en: {
      title: 'Image to Voxel Pixel Art Studio',
      subtitle: 'Quantize 2D imagery into Minecraft blocks with precision dithering and calibrated material palettes.',
      uploadTitle: 'Source Graphic',
      resolution: 'Canvas Grid',
      brightness: 'Brightness',
      contrast: 'Contrast',
      palette: 'Material Palette',
      algorithm: 'Dithering Algorithm',
      orientation: 'Build Orientation',
      verticalMural: 'Standing Mural (Vertical)',
      horizontalCarpet: 'Flat Floor (Horizontal)',
      generateStructure: 'Synthesize 3D Minecraft Structure',
      blocksUsed: 'Materials Mapped',
    },
    zh: {
      title: '图片转像素画工作区',
      subtitle: '将 2D 图像量化映射为 Minecraft 方块，支持色彩校正、抖动算法与材质调色板。',
      uploadTitle: '源图像输入',
      resolution: '画布分辨率',
      brightness: '亮度调整',
      contrast: '对比度调整',
      palette: '材质调色板',
      algorithm: '抖动算法',
      orientation: '建造朝向',
      verticalMural: '立式壁画 (垂直面)',
      horizontalCarpet: '地面铺装 (水平面)',
      generateStructure: '合成 3D 建筑结构并载入',
      blocksUsed: '已映射方块种类',
    },
  }[lang];

  const getPaletteBlocks = () => {
    const all = Object.keys(BLOCK_REGISTRY);
    if (paletteType === 'concrete') return all.filter((k) => k.includes('concrete'));
    if (paletteType === 'terracotta') return all.filter((k) => k.includes('terracotta'));
    if (paletteType === 'wool') return all.filter((k) => k.includes('wool'));
    if (paletteType === 'stone') return all.filter((k) => k.includes('stone') || k.includes('deepslate') || k.includes('tuff'));
    return all;
  };

  const processImage = () => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = resolution;
      canvas.height = resolution;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      ctx.drawImage(img, 0, 0, resolution, resolution);

      const imgData = ctx.getImageData(0, 0, resolution, resolution);
      const palette = getPaletteBlocks();
      const pixels = processImageToPixelArt(imgData, palette, algorithm);
      setProcessedPixels(pixels);

      if (canvasRef.current) {
        const previewCanvas = canvasRef.current;
        previewCanvas.width = resolution * 12;
        previewCanvas.height = resolution * 12;
        const pCtx = previewCanvas.getContext('2d');
        if (pCtx) {
          pCtx.imageSmoothingEnabled = false;
          pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

          for (const p of pixels) {
            pCtx.fillStyle = p.block.color;
            pCtx.fillRect(p.x * 12, p.y * 12, 12, 12);
          }
        }
      }
    };
  };

  useEffect(() => {
    processImage();
  }, [imageSrc, resolution, brightness, contrast, paletteType, algorithm]);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 32, 32);
      grad.addColorStop(0, '#10b981');
      grad.addColorStop(0.5, '#3b82f6');
      grad.addColorStop(1, '#8b5cf6');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(16, 16, 10, 0, Math.PI * 2);
      ctx.fill();
      setImageSrc(canvas.toDataURL());
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

  const handleGenerateStructure = async () => {
    if (processedPixels.length === 0) return;

    const blocks: VoxelBlock[] = processedPixels.map((p) => {
      if (buildOrientation === 'vertical') {
        return {
          x: p.x,
          y: resolution - 1 - p.y,
          z: 0,
          blockId: p.block.id,
        };
      } else {
        return {
          x: p.x,
          y: 0,
          z: p.y,
          blockId: p.block.id,
        };
      }
    });

    const struct: StructureData = {
      id: 'pixel_' + Date.now(),
      name: `Pixel Art (${resolution}×${resolution})`,
      description: `Generated from 2D pixel graphic with ${paletteType} palette.`,
      author: 'BlockCraft Pixel Studio',
      version: '1.20.4',
      size:
        buildOrientation === 'vertical'
          ? { x: resolution, y: resolution, z: 1 }
          : { x: resolution, y: 1, z: resolution },
      regions: [
        {
          id: 'reg_mural',
          name: 'Pixel Art Canvas',
          bounds: {
            min: [0, 0, 0],
            max:
              buildOrientation === 'vertical'
                ? [resolution, resolution, 1]
                : [resolution, 1, resolution],
          },
          locked: false,
          visible: true,
          color: '#10B981',
        },
      ],
      blocks,
    };

    const grid = await runEngineTask<any>('image.pixel-art', {
      width: struct.size.x,
      height: struct.size.y,
      length: struct.size.z,
      cells: struct.blocks.map((block) => ({ x: block.x, y: block.y, z: block.z, block: { id: block.blockId }, source: 'voxelartcraft' })),
    });
    onLoadStructure(gridToStructure(grid, { name: struct.name, description: struct.description }));
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-5 lg:p-7 space-y-6 max-w-7xl mx-auto w-full bg-[#090a0f]">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold tracking-tight text-white">{t.title}</h1>
        <p className="text-xs text-zinc-400 mt-1">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Calibration Controls */}
        <div className="lg:col-span-5 bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 space-y-4">
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.uploadTitle}</span>
            <label className="border border-dashed border-white/10 hover:border-white/20 rounded-md p-3.5 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white/[0.01]">
              <Upload className="w-4 h-4 text-zinc-400 mb-1" />
              <span className="text-xs text-zinc-300 font-medium">Upload File</span>
              <span className="text-[10px] text-zinc-500 font-mono">PNG, JPG, SVG, WebP</span>
              <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-300">
              <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.resolution}</span>
              <span className="font-mono text-emerald-400">{resolution}×{resolution}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[16, 32, 48, 64].map((size) => (
                <button
                  key={size}
                  onClick={() => setResolution(size)}
                  className={`py-1.5 rounded text-xs font-mono transition-colors border ${
                    resolution === size
                      ? 'bg-white/10 border-white/20 text-white font-medium'
                      : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                  }`}
                >
                  {size}²
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-300">
                <span className="text-[11px] font-mono text-zinc-500 uppercase">{t.brightness}</span>
                <span className="font-mono text-zinc-400">{brightness}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={150}
                value={brightness}
                onChange={(e) => setBrightness(parseInt(e.target.value))}
                className="w-full accent-white h-1 bg-zinc-700 rounded"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-300">
                <span className="text-[11px] font-mono text-zinc-500 uppercase">{t.contrast}</span>
                <span className="font-mono text-zinc-400">{contrast}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={150}
                value={contrast}
                onChange={(e) => setContrast(parseInt(e.target.value))}
                className="w-full accent-white h-1 bg-zinc-700 rounded"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
            <div>
              <label className="text-[11px] font-mono text-zinc-500 uppercase block mb-1">{t.palette}</label>
              <select
                value={paletteType}
                onChange={(e) => setPaletteType(e.target.value)}
                className="w-full studio-input rounded p-1.5 text-xs bg-[#090a0f]"
              >
                <option value="concrete">Concrete (纯色混凝土)</option>
                <option value="terracotta">Terracotta (陶瓦与硬化粘土)</option>
                <option value="wool">Wool (羊毛系列)</option>
                <option value="stone">Stone & Deepslate (石材质感)</option>
                <option value="all">Full Palette (全量 1.20 方块)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-mono text-zinc-500 uppercase block mb-1">{t.algorithm}</label>
              <div className="grid grid-cols-3 gap-1">
                {(['floyd-steinberg', 'atkinson', 'nearest'] as const).map((algo) => (
                  <button
                    key={algo}
                    onClick={() => setAlgorithm(algo)}
                    className={`py-1 rounded text-[11px] font-mono transition-colors border capitalize ${
                      algorithm === algo
                        ? 'bg-white/10 border-white/20 text-white'
                        : 'bg-white/[0.02] border-transparent text-zinc-400 hover:text-white'
                    }`}
                  >
                    {algo.split('-')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-mono text-zinc-500 uppercase block mb-1">{t.orientation}</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setBuildOrientation('vertical')}
                  className={`py-1.5 rounded text-xs transition-colors border ${
                    buildOrientation === 'vertical'
                      ? 'bg-white/10 border-white/20 text-white font-medium'
                      : 'bg-white/[0.02] border-transparent text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.verticalMural}
                </button>
                <button
                  onClick={() => setBuildOrientation('horizontal')}
                  className={`py-1.5 rounded text-xs transition-colors border ${
                    buildOrientation === 'horizontal'
                      ? 'bg-white/10 border-white/20 text-white font-medium'
                      : 'bg-white/[0.02] border-transparent text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.horizontalCarpet}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerateStructure}
            className="w-full py-2.5 px-4 rounded-md btn-primary text-xs font-semibold flex items-center justify-center gap-2 pt-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.generateStructure}</span>
          </button>
        </div>

        {/* Right Column: High-DPI Pixel Matrix Preview */}
        <div className="lg:col-span-7 bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 flex flex-col items-center justify-center min-h-[460px]">
          <div className="border border-white/10 rounded-md overflow-hidden bg-black/60 shadow-2xl p-2 max-w-full">
            <canvas
              ref={canvasRef}
              className="max-h-[420px] max-w-full object-contain image-rendering-pixelated"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

          <div className="mt-4 flex items-center gap-3 text-xs text-zinc-400 font-mono">
            <span>{processedPixels.length.toLocaleString()} voxels</span>
            <span>·</span>
            <span>{resolution}×{resolution}</span>
            <span>·</span>
            <span className="text-emerald-400 capitalize">{algorithm}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
