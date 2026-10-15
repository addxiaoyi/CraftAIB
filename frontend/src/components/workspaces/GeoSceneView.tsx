import React, { useState, useMemo } from 'react';
import { StructureData, VoxelBlock } from '../../types/minecraft';
import { ThreeViewport } from '../ThreeViewport';
import { gridToStructure, runEngineTask } from '../../integrations/engine';
import { useEngineCommit } from '../../hooks/useEngineCommit';
import { tr } from '../../i18n';
import { Mountain, Sparkles } from 'lucide-react';

interface GeoSceneViewProps {
  onLoadStructure: (structure: StructureData) => void;
  lang: 'zh' | 'en';
}

type BiomePreset = 'alpine' | 'canyon' | 'archipelago' | 'plains';

export const GeoSceneView: React.FC<GeoSceneViewProps> = ({
  onLoadStructure,
  lang,
}) => {
  const [biome, setBiome] = useState<BiomePreset>('alpine');
  const [size, setSize] = useState<number>(32);
  const [elevationScale, setElevationScale] = useState<number>(18);
  const [seaLevel, setSeaLevel] = useState<number>(5);
  const [roadWidth, setRoadWidth] = useState<number>(3);
  const [hasRoad, setHasRoad] = useState<boolean>(true);
  const [roughness, setRoughness] = useState<number>(4);
  const engine = useEngineCommit();

  const base = {
    en: {
      title: 'Geo Scene & Topographical Engineering',
      subtitle: 'Synthesize geographical terrains, mountain topography, water tables, and road infrastructures.',
      biomeType: 'Biome Archetype',
      terrainSize: 'Chunk Grid',
      elevation: 'Peak Elevation',
      seaLevel: 'Sea Water Datum',
      roughness: 'Surface Roughness',
      roadParams: 'Road Infrastructure',
      hasRoad: 'Synthesize Paved Highway',
      roadWidth: 'Road Width (Voxels)',
      loadToStudio: 'Mount Terrain to 3D Viewport',
      terrainVoxels: 'Terrain Voxels',
    },
    zh: {
      title: 'Geo Scene 地貌与地形工坊',
      subtitle: '参数化地形生成、多生物群系模拟、海平面水体深度与道路规划基础设施。',
      biomeType: '群系原型',
      terrainSize: '区块网格',
      elevation: '山脊峰值高度',
      seaLevel: '海平面基准面',
      roughness: '地表起伏糙度',
      roadParams: '交通基础设施',
      hasRoad: '自动铺设蜿蜒公路',
      roadWidth: '道路宽度 (方块)',
      loadToStudio: '载入此地貌至主工作区',
      terrainVoxels: '地形体素总数',
    },
  }[lang];
  const t = lang === 'zh' ? { ...base, title: tr(lang).pages.geo, subtitle: '生成地形、道路、植被和高度场，并转换为 Minecraft 结构。', biome: '地貌预设', terrainSize: '地形尺寸', elevation: '高度范围', seaLevel: '海平面', roughness: '地表起伏', roadParams: '道路参数', hasRoad: '生成道路', roadWidth: '道路宽度', loadToStudio: '载入 3D 查看器', terrainVoxels: '地形体素' } : base;

  const terrainStructure = useMemo<StructureData>(() => {
    const s = size;
    const blocks: VoxelBlock[] = [];

    const noise2D = (x: number, z: number, scale: number) => {
      return (
        Math.sin(x * scale * 0.1) * Math.cos(z * scale * 0.1) +
        Math.sin((x + z) * scale * 0.05) * 0.5 +
        Math.cos(x * scale * 0.2) * Math.sin(z * scale * 0.18) * 0.25
      );
    };

    const getRoadZ = (x: number) => {
      return Math.floor(s / 2 + Math.sin(x * 0.2) * (s * 0.25));
    };

    for (let x = 0; x < s; x++) {
      for (let z = 0; z < s; z++) {
        let n = noise2D(x, z, roughness);
        if (biome === 'canyon') {
          n = Math.floor(n * 4) / 4;
        } else if (biome === 'archipelago') {
          const distToCenter = Math.sqrt((x - s / 2) ** 2 + (z - s / 2) ** 2) / (s / 2);
          n = n - distToCenter * 1.2;
        }

        const height = Math.max(1, Math.min(elevationScale, Math.floor((n + 1) * 0.5 * elevationScale) + 2));
        const roadZ = getRoadZ(x);
        const isOnRoad = hasRoad && Math.abs(z - roadZ) <= Math.floor(roadWidth / 2);

        for (let y = 0; y <= height; y++) {
          let blockId = 'minecraft:stone';

          if (biome === 'alpine') {
            if (y === height) {
              blockId = y > elevationScale * 0.75 ? 'minecraft:calcite' : 'minecraft:grass_block';
            } else if (y >= height - 2) {
              blockId = 'minecraft:dirt';
            } else {
              blockId = 'minecraft:stone_bricks';
            }
          } else if (biome === 'canyon') {
            if (y % 4 === 0) blockId = 'minecraft:terracotta';
            else if (y % 4 === 1) blockId = 'minecraft:white_terracotta';
            else if (y % 4 === 2) blockId = 'minecraft:orange_concrete';
            else blockId = 'minecraft:red_sandstone';
          } else if (biome === 'archipelago') {
            if (y < seaLevel) {
              blockId = 'minecraft:sand';
            } else if (y === height) {
              blockId = 'minecraft:grass_block';
            } else {
              blockId = 'minecraft:dirt';
            }
          } else if (biome === 'plains') {
            blockId = y === height ? 'minecraft:grass_block' : 'minecraft:dirt';
          }

          if (isOnRoad && y === height) {
            blockId = 'minecraft:smooth_stone';
          }

          blocks.push({ x, y, z, blockId });
        }

        if (biome === 'archipelago' && height < seaLevel) {
          for (let y = height + 1; y <= seaLevel; y++) {
            blocks.push({ x, y, z, blockId: 'minecraft:prismarine_bricks' });
          }
        }
      }
    }

    return {
      id: 'geo_' + biome + '_' + Date.now(),
      name: `Topography (${biome.toUpperCase()})`,
      description: `Procedural terrain with ${s}×${s} bounds and elevation ${elevationScale}.`,
      author: 'BlockCraft Geo Studio',
      version: '1.20.4',
      size: { x: s, y: Math.max(elevationScale + 4, 16), z: s },
      regions: [
        {
          id: 'reg_geo',
          name: `${biome.toUpperCase()} Bounding Box`,
          bounds: { min: [0, 0, 0], max: [s, Math.max(elevationScale + 4, 16), s] },
          locked: false,
          visible: true,
          color: '#10B981',
        },
      ],
      blocks,
    };
  }, [biome, size, elevationScale, seaLevel, hasRoad, roadWidth, roughness]);

  const commitTerrain = async () => {
    const structure = await engine.run(async (signal, report) => {
      report('Converting terrain...');
      const elevation = Array.from({ length: size * size }, (_, index) => {
        const x = index % size;
        const z = Math.floor(index / size);
        return terrainStructure.blocks.filter((block) => block.x === x && block.z === z).reduce((highest, block) => Math.max(highest, block.y), 0);
      });
      const grid = await runEngineTask<any>('geo.blockgrid', {
        center: { lat: 0, lng: 0 }, width: size, length: size, elevation,
        ground: { id: biome === 'canyon' ? 'minecraft:red_sand' : 'minecraft:grass_block' },
        vegetation: biome === 'plains' || biome === 'alpine',
      }, undefined, signal, (_value, stage) => report(stage));
      return gridToStructure(grid, { name: terrainStructure.name, description: terrainStructure.description });
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
        {/* Left Column: Topographical Settings */}
        <div className="lg:col-span-5 bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 space-y-4">
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.biomeType}</span>
            <div className="grid grid-cols-2 gap-1.5">
              {(['alpine', 'canyon', 'archipelago', 'plains'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBiome(b)}
                  className={`p-2 rounded-md text-xs font-mono capitalize transition-colors border ${
                    biome === b
                      ? 'bg-white/10 border-white/20 text-white font-medium'
                      : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.terrainSize}</span>
            <div className="grid grid-cols-3 gap-2">
              {[24, 32, 40].map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`py-1.5 rounded-md text-xs font-mono border transition-colors ${
                    size === s
                      ? 'bg-white/10 border-white/20 text-white font-medium'
                      : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                  }`}
                >
                  {s}×{s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-300">
                <span className="text-[11px] font-mono text-zinc-500 uppercase">{t.elevation}</span>
                <span className="font-mono text-emerald-400 tabular-nums">{elevationScale} blocks</span>
              </div>
              <input
                type="range"
                min={10}
                max={30}
                value={elevationScale}
                onChange={(e) => setElevationScale(parseInt(e.target.value))}
                className="w-full accent-white h-1 bg-zinc-700 rounded"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-300">
                <span className="text-[11px] font-mono text-zinc-500 uppercase">{t.seaLevel}</span>
                <span className="font-mono text-sky-400 tabular-nums">Y={seaLevel}</span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                value={seaLevel}
                onChange={(e) => setSeaLevel(parseInt(e.target.value))}
                className="w-full accent-white h-1 bg-zinc-700 rounded"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-300">
                <span className="text-[11px] font-mono text-zinc-500 uppercase">{t.roughness}</span>
                <span className="font-mono text-zinc-400 tabular-nums">{roughness}</span>
              </div>
              <input
                type="range"
                min={2}
                max={8}
                value={roughness}
                onChange={(e) => setRoughness(parseInt(e.target.value))}
                className="w-full accent-white h-1 bg-zinc-700 rounded"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-200">
              <input
                type="checkbox"
                checked={hasRoad}
                onChange={(e) => setHasRoad(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <span className="font-medium">{t.hasRoad}</span>
            </label>

            {hasRoad && (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                  <span>{t.roadWidth}</span>
                  <span className="text-emerald-400 tabular-nums">{roadWidth}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={roadWidth}
                  onChange={(e) => setRoadWidth(parseInt(e.target.value))}
                  className="w-full accent-white h-1 bg-zinc-700 rounded"
                />
              </div>
            )}
          </div>

          <button
            data-engine-commit="geo"
            onClick={() => void commitTerrain()}
            disabled={engine.isRunning}
            className="w-full py-2.5 px-4 rounded-md btn-primary text-xs font-semibold flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{engine.isRunning ? engine.progress : t.loadToStudio}</span>
          </button>
          {engine.isRunning && <button type="button" onClick={engine.cancel} className="w-full mt-2 py-1.5 text-xs border border-white/10 rounded text-zinc-300">Cancel</button>}
          {engine.error && <p role="alert" className="text-xs text-red-300 mt-2">{engine.error}</p>}
        </div>

        {/* Right Column: 3D Preview */}
        <div className="lg:col-span-7 bg-[#0e1118] border border-white/[0.07] rounded-lg overflow-hidden h-[540px] flex flex-col relative">
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between text-xs bg-white/[0.01]">
            <span className="font-medium text-zinc-200">Procedural Topography Matrix</span>
            <span className="font-mono text-emerald-400 tabular-nums">
              {terrainStructure.blocks.length.toLocaleString()} {t.terrainVoxels}
            </span>
          </div>

          <div className="flex-1 relative">
            <ThreeViewport structure={terrainStructure} />
          </div>
        </div>
      </div>
    </div>
  );
};
