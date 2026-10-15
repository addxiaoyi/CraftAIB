import React, { useState, useMemo } from 'react';
import { StructureData, VoxelBlock } from '../../types/minecraft';
import { ThreeViewport } from '../ThreeViewport';
import { gridToStructure, runEngineTask, structureToGrid } from '../../integrations/engine';
import { useEngineCommit } from '../../hooks/useEngineCommit';
import { tr } from '../../i18n';
import {
  Boxes,
  Sparkles,
  Scissors,
} from 'lucide-react';

interface VoxelLabViewProps {
  onLoadStructure: (structure: StructureData) => void;
  lang: 'zh' | 'en';
}

type VoxelPrimitive = 'gyroid' | 'sphere' | 'torus' | 'helix' | 'pyramid' | 'arch';

export const VoxelLabView: React.FC<VoxelLabViewProps> = ({
  onLoadStructure,
  lang,
}) => {
  const [primitive, setPrimitive] = useState<VoxelPrimitive>('gyroid');
  const [resolution, setResolution] = useState<number>(24);
  const [selectedBlockId, setSelectedBlockId] = useState<string>('minecraft:deepslate_bricks');
  const [accentBlockId, setAccentBlockId] = useState<string>('minecraft:calcite');
  const [sliceX, setSliceX] = useState<number>(24);
  const [sliceY, setSliceY] = useState<number>(24);
  const [sliceZ, setSliceZ] = useState<number>(24);
  const [hollow, setHollow] = useState<boolean>(true);
  const engine = useEngineCommit();

  const base = {
    en: {
      title: 'Voxel Lab & Parametric Mathematics',
      subtitle: 'Sculpt mathematical SDF voxel volumes, extract depth buffers, and slice cross-sections with orthogonal planes.',
      geometryType: 'Parametric Geometry',
      resolutionLabel: 'Voxel Grid',
      blockMaterial: 'Primary Material',
      accentMaterial: 'Accent Material',
      hollowShell: 'Hollow Shell (Conserves Voxels)',
      crossSections: 'Orthogonal Slicing Planes',
      sliceXLabel: 'Clip X',
      sliceYLabel: 'Clip Y',
      sliceZLabel: 'Clip Z',
      loadToStudio: 'Mount Voxel Volume to 3D Viewport',
      activeVoxels: 'Active Solid Voxels',
    },
    zh: {
      title: 'Voxel 体素实验室与空间切面',
      subtitle: '参数化体素几何生成、三维深度缓冲区分析、多相机投影与正交三轴切面控制。',
      geometryType: '数学几何原型',
      resolutionLabel: '体素网格',
      blockMaterial: '主体方块材质',
      accentMaterial: '修饰方块材质',
      hollowShell: '保留空心外壳 (节省材料)',
      crossSections: '三轴剖切与切面控制',
      sliceXLabel: 'X 轴剖切',
      sliceYLabel: 'Y 轴剖切',
      sliceZLabel: 'Z 轴剖切',
      loadToStudio: '载入此体素结构至主视口',
      activeVoxels: '有效体素数',
    },
  }[lang];
  const t = lang === 'zh' ? { ...base, title: tr(lang).pages.voxel, subtitle: '生成参数化体素形状，控制材料、分辨率和三轴切面。', geometryType: '参数化形状', resolutionLabel: '体素分辨率', blockMaterial: '主材料', accentMaterial: '强调材料', hollowShell: '空心外壳', crossSections: '三轴切面', sliceXLabel: 'X 轴切面', sliceYLabel: 'Y 轴切面', sliceZLabel: 'Z 轴切面', loadToStudio: '载入 3D 查看器', activeVoxels: '有效体素' } : base;

  const generatedStructure = useMemo<StructureData>(() => {
    const s = resolution;
    const blocks: VoxelBlock[] = [];
    const r = s / 2;

    for (let x = 0; x < s; x++) {
      if (x > sliceX) continue;
      for (let y = 0; y < s; y++) {
        if (y > sliceY) continue;
        for (let z = 0; z < s; z++) {
          if (z > sliceZ) continue;

          const nx = (x - r) / r;
          const ny = (y - r) / r;
          const nz = (z - r) / r;

          let isSolid = false;
          let isAccent = false;

          if (primitive === 'sphere') {
            const dist = Math.sqrt(nx * nx + ny * ny + nz * nz);
            isSolid = hollow ? dist >= 0.85 && dist <= 1.0 : dist <= 1.0;
            isAccent = Math.abs(ny) < 0.1 || Math.abs(nx) < 0.08;
          } else if (primitive === 'torus') {
            const q = Math.sqrt(nx * nx + nz * nz) - 0.6;
            const dist = Math.sqrt(q * q + ny * ny);
            isSolid = hollow ? dist >= 0.18 && dist <= 0.35 : dist <= 0.35;
            isAccent = (x + z) % 3 === 0;
          } else if (primitive === 'gyroid') {
            const scale = Math.PI * 2.2;
            const val =
              Math.cos(nx * scale) * Math.sin(ny * scale) +
              Math.cos(ny * scale) * Math.sin(nz * scale) +
              Math.cos(nz * scale) * Math.sin(nx * scale);
            isSolid = Math.abs(val) < (hollow ? 0.3 : 0.65);
            isAccent = val > 0.1;
          } else if (primitive === 'helix') {
            const angle = ny * Math.PI * 4;
            const targetX = Math.cos(angle) * 0.55;
            const targetZ = Math.sin(angle) * 0.55;
            const dist = Math.sqrt((nx - targetX) ** 2 + (nz - targetZ) ** 2);
            isSolid = dist < 0.22;
            isAccent = y % 4 === 0;
          } else if (primitive === 'pyramid') {
            const maxRadius = 1 - ny;
            if (ny >= 0) {
              const inside = Math.abs(nx) <= maxRadius && Math.abs(nz) <= maxRadius;
              if (hollow) {
                const border =
                  Math.abs(Math.abs(nx) - maxRadius) < 0.15 ||
                  Math.abs(Math.abs(nz) - maxRadius) < 0.15;
                isSolid = inside && border;
              } else {
                isSolid = inside;
              }
              isAccent = (x + z) % 2 === 0;
            }
          } else if (primitive === 'arch') {
            const isColumn = Math.abs(nx) > 0.6 && ny > -0.9 && ny < 0.3;
            const archDist = Math.sqrt(nx * nx + (ny - 0.3) ** 2);
            const isArchRing = archDist >= 0.55 && archDist <= 0.75 && ny >= 0.3;
            isSolid = (isColumn || isArchRing) && Math.abs(nz) < 0.4;
            isAccent = ny > 0.25;
          }

          if (isSolid) {
            blocks.push({
              x,
              y,
              z,
              blockId: isAccent ? accentBlockId : selectedBlockId,
            });
          }
        }
      }
    }

    return {
      id: 'voxel_' + primitive + '_' + Date.now(),
      name: `Parametric ${primitive.toUpperCase()}`,
      description: `Mathematical ${primitive} generated at ${s}³ resolution.`,
      author: 'BlockCraft Voxel Lab',
      version: '1.20.4',
      size: { x: s, y: s, z: s },
      regions: [
        {
          id: 'reg_voxel',
          name: `${primitive.toUpperCase()} Bounding Box`,
          bounds: { min: [0, 0, 0], max: [s, s, s] },
          locked: false,
          visible: true,
          color: '#10B981',
        },
      ],
      blocks,
    };
  }, [primitive, resolution, selectedBlockId, accentBlockId, sliceX, sliceY, sliceZ, hollow]);

  const commitVoxel = async () => {
    const structure = await engine.run(async (signal, report) => {
      report('Validating voxel grid...');
      const grid = structureToGrid(generatedStructure);
      await runEngineTask('grid.validate', grid, undefined, signal, (_value, stage) => report(stage));
      return gridToStructure(grid, { name: generatedStructure.name, description: generatedStructure.description });
    });
    if (structure) onLoadStructure(structure);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-5 lg:p-7 space-y-6 max-w-7xl mx-auto w-full bg-[#090a0f]">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold tracking-tight text-white">{t.title}</h1>
        <p className="text-xs text-zinc-400 mt-1">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Mathematical Controls */}
        <div className="lg:col-span-5 bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 space-y-4">
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.geometryType}</span>
            <div className="grid grid-cols-3 gap-1.5">
              {(['gyroid', 'sphere', 'torus', 'helix', 'pyramid', 'arch'] as const).map((geo) => (
                <button
                  key={geo}
                  onClick={() => setPrimitive(geo)}
                  className={`py-2 px-1 rounded-md text-xs font-mono capitalize transition-colors border ${
                    primitive === geo
                      ? 'bg-white/10 border-white/20 text-white font-medium'
                      : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                  }`}
                >
                  {geo}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-300">
              <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.resolutionLabel}</span>
              <span className="font-mono text-emerald-400">{resolution}³</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[16, 24, 32].map((res) => (
                <button
                  key={res}
                  onClick={() => {
                    setResolution(res);
                    setSliceX(res);
                    setSliceY(res);
                    setSliceZ(res);
                  }}
                  className={`py-1.5 rounded-md text-xs font-mono border transition-colors ${
                    resolution === res
                      ? 'bg-white/10 border-white/20 text-white font-medium'
                      : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                  }`}
                >
                  {res}³
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500 uppercase">{t.blockMaterial}</span>
              <select
                value={selectedBlockId}
                onChange={(e) => setSelectedBlockId(e.target.value)}
                className="w-full studio-input rounded p-1.5 text-xs bg-[#090a0f] text-white"
              >
                <option value="minecraft:deepslate_bricks">Deepslate Bricks</option>
                <option value="minecraft:stone_bricks">Stone Bricks</option>
                <option value="minecraft:obsidian">Obsidian</option>
                <option value="minecraft:white_concrete">White Concrete</option>
                <option value="minecraft:oxidized_copper">Oxidized Copper</option>
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500 uppercase">{t.accentMaterial}</span>
              <select
                value={accentBlockId}
                onChange={(e) => setAccentBlockId(e.target.value)}
                className="w-full studio-input rounded p-1.5 text-xs bg-[#090a0f] text-white"
              >
                <option value="minecraft:calcite">Calcite</option>
                <option value="minecraft:sea_lantern">Sea Lantern</option>
                <option value="minecraft:crying_obsidian">Crying Obsidian</option>
                <option value="minecraft:gold_block">Gold Block</option>
                <option value="minecraft:cherry_planks">Cherry Planks</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-white/[0.06]">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-200">
              <input
                type="checkbox"
                checked={hollow}
                onChange={(e) => setHollow(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <span className="font-medium">{t.hollowShell}</span>
            </label>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <Scissors className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.crossSections}</span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                <span>{t.sliceXLabel}</span>
                <span className="text-emerald-400 tabular-nums">{sliceX}</span>
              </div>
              <input
                type="range"
                min={1}
                max={resolution}
                value={sliceX}
                onChange={(e) => setSliceX(parseInt(e.target.value))}
                className="w-full accent-white h-1 bg-zinc-700 rounded"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                <span>{t.sliceYLabel}</span>
                <span className="text-emerald-400 tabular-nums">{sliceY}</span>
              </div>
              <input
                type="range"
                min={1}
                max={resolution}
                value={sliceY}
                onChange={(e) => setSliceY(parseInt(e.target.value))}
                className="w-full accent-white h-1 bg-zinc-700 rounded"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                <span>{t.sliceZLabel}</span>
                <span className="text-emerald-400 tabular-nums">{sliceZ}</span>
              </div>
              <input
                type="range"
                min={1}
                max={resolution}
                value={sliceZ}
                onChange={(e) => setSliceZ(parseInt(e.target.value))}
                className="w-full accent-white h-1 bg-zinc-700 rounded"
              />
            </div>
          </div>

          <button
            data-engine-commit="voxel"
            onClick={() => void commitVoxel()}
            disabled={engine.isRunning}
            className="w-full py-2.5 px-4 rounded-md btn-primary text-xs font-semibold flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{engine.isRunning ? engine.progress : t.loadToStudio}</span>
          </button>
          {engine.isRunning && <button type="button" onClick={engine.cancel} className="w-full mt-2 py-1.5 text-xs border border-white/10 rounded text-zinc-300">Cancel</button>}
          {engine.error && <p role="alert" className="text-xs text-red-300 mt-2">{engine.error}</p>}
        </div>

        {/* Right Column: 3D CAD Preview */}
        <div className="lg:col-span-7 bg-[#0e1118] border border-white/[0.07] rounded-lg overflow-hidden h-[540px] relative flex flex-col">
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between text-xs bg-white/[0.01]">
            <span className="font-medium text-zinc-200">Parametric Surface Projection</span>
            <span className="font-mono text-emerald-400 tabular-nums">
              {generatedStructure.blocks.length.toLocaleString()} {t.activeVoxels}
            </span>
          </div>

          <div className="flex-1 relative">
            <ThreeViewport structure={generatedStructure} />
          </div>
        </div>
      </div>
    </div>
  );
};
