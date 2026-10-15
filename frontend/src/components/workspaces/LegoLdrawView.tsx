import React, { useState, useMemo } from 'react';
import { StructureData, VoxelBlock } from '../../types/minecraft';
import { ThreeViewport } from '../ThreeViewport';
import { gridToStructure, runEngineTask } from '../../integrations/engine';
import { useEngineCommit } from '../../hooks/useEngineCommit';
import { tr } from '../../i18n';
import {
  Blocks,
  Upload,
  Sparkles,
} from 'lucide-react';

interface LegoLdrawProps {
  onLoadStructure: (structure: StructureData) => void;
  lang: 'zh' | 'en';
}

const LEGO_TO_MC_MAP: Record<number, { name: string; mcBlockId: string; color: string }> = {
  0: { name: 'Black', mcBlockId: 'minecraft:black_concrete', color: '#141519' },
  1: { name: 'Blue', mcBlockId: 'minecraft:blue_concrete', color: '#2c2e8f' },
  2: { name: 'Green', mcBlockId: 'minecraft:green_concrete', color: '#495b24' },
  4: { name: 'Red', mcBlockId: 'minecraft:red_concrete', color: '#8e2020' },
  7: { name: 'Light Gray', mcBlockId: 'minecraft:light_gray_concrete', color: '#7d7d73' },
  8: { name: 'Dark Gray', mcBlockId: 'minecraft:gray_concrete', color: '#36393d' },
  14: { name: 'Yellow', mcBlockId: 'minecraft:yellow_concrete', color: '#f0af15' },
  15: { name: 'White', mcBlockId: 'minecraft:white_concrete', color: '#cfd5d6' },
  19: { name: 'Tan', mcBlockId: 'minecraft:sand', color: '#dbd3a0' },
  28: { name: 'Dark Tan', mcBlockId: 'minecraft:oak_planks', color: '#a88752' },
  71: { name: 'Magenta', mcBlockId: 'minecraft:magenta_concrete', color: '#a9309f' },
  72: { name: 'Orange', mcBlockId: 'minecraft:orange_concrete', color: '#e06100' },
  320: { name: 'Dark Red', mcBlockId: 'minecraft:mangrove_planks', color: '#763631' },
};

const PRESET_LDRAW_MODELS = {
  castle: `0 // LEGO Classic Castle Tower
1 7 0 0 0 1 0 0 0 1 0 0 0 1 3005.dat
1 7 20 0 0 1 0 0 0 1 0 0 0 1 3005.dat
1 7 40 0 0 1 0 0 0 1 0 0 0 1 3005.dat
1 7 0 0 20 1 0 0 0 1 0 0 0 1 3005.dat
1 7 40 0 20 1 0 0 0 1 0 0 0 1 3005.dat
1 7 0 0 40 1 0 0 0 1 0 0 0 1 3005.dat
1 7 20 0 40 1 0 0 0 1 0 0 0 1 3005.dat
1 7 40 0 40 1 0 0 0 1 0 0 0 1 3005.dat
1 8 0 -24 0 1 0 0 0 1 0 0 0 1 3005.dat
1 8 40 -24 0 1 0 0 0 1 0 0 0 1 3005.dat
1 8 0 -24 40 1 0 0 0 1 0 0 0 1 3005.dat
1 8 40 -24 40 1 0 0 0 1 0 0 0 1 3005.dat
1 4 20 -48 20 1 0 0 0 1 0 0 0 1 3005.dat`,
  rover: `0 // LEGO Space Lunar Rover
1 15 0 0 0 1 0 0 0 1 0 0 0 1 3005.dat
1 15 20 0 0 1 0 0 0 1 0 0 0 1 3005.dat
1 1 0 0 20 1 0 0 0 1 0 0 0 1 3005.dat
1 1 20 0 20 1 0 0 0 1 0 0 0 1 3005.dat
1 14 0 -24 10 1 0 0 0 1 0 0 0 1 3005.dat
1 0 -20 24 -10 1 0 0 0 1 0 0 0 1 3005.dat
1 0 40 24 -10 1 0 0 0 1 0 0 0 1 3005.dat
1 0 -20 24 30 1 0 0 0 1 0 0 0 1 3005.dat
1 0 40 24 30 1 0 0 0 1 0 0 0 1 3005.dat`,
};

export const LegoLdrawView: React.FC<LegoLdrawProps> = ({
  onLoadStructure,
  lang,
}) => {
  const [ldrawCode, setLdrawCode] = useState<string>(PRESET_LDRAW_MODELS.castle);
  const [scaleFactor, setScaleFactor] = useState<number>(1);
  const [modelName, setModelName] = useState<string>('Classic Castle Tower');
  const engine = useEngineCommit();

  const base = {
    en: {
      title: 'LEGO / LDraw Model Bridge',
      subtitle: 'Parse LDraw (.ldr/.dat) CAD files, preview brick parts, and map LEGO colors to Minecraft blocks.',
      modelCodeLabel: 'LDraw DAT / LDR Specification',
      uploadLdr: 'Upload .ldr',
      presets: 'Presets',
      colorMappingTitle: 'LEGO Color to Minecraft Block Mapping',
      brickScaleLabel: 'Stud to Voxel Scale',
      convertToStructure: 'Synthesize Minecraft Structure',
      parsedPartsCount: 'Brick Elements',
    },
    zh: {
      title: 'LEGO / LDraw 模型导入与方块映射',
      subtitle: '解析 LDraw (.ldr/.dat) 积木模型，预览零件结构，并将乐高标准色卡精准映射为 Minecraft 方块。',
      modelCodeLabel: 'LDraw DAT / LDR 代码编辑器',
      uploadLdr: '上传 .ldr 文件',
      presets: '预设模型',
      colorMappingTitle: '乐高色号与 Minecraft 方块对照表',
      brickScaleLabel: '颗粒比例换算 (Stud 颗粒比)',
      convertToStructure: '转换为 Minecraft 结构并载入',
      parsedPartsCount: '积木零件单元',
    },
  }[lang];
  const t = lang === 'zh' ? { ...base, title: tr(lang).pages.lego, subtitle: '解析 LDraw 文件，预览零件并映射为 Minecraft 方块。', uploadModel: '导入 LDraw 模型', modelName: '模型名称', scale: '缩放', convertToStructure: '转换为 Minecraft 结构' } : base;

  const parsedStructure = useMemo<StructureData>(() => {
    const lines = ldrawCode.split('\n');
    const blocks: VoxelBlock[] = [];
    const minCoord = [Infinity, Infinity, Infinity];
    const maxCoord = [-Infinity, -Infinity, -Infinity];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('1 ')) continue;

      const tokens = line.split(/\s+/);
      if (tokens.length < 15) continue;

      const colorCode = parseInt(tokens[1], 10);
      const x = parseFloat(tokens[2]);
      const y = parseFloat(tokens[3]);
      const z = parseFloat(tokens[4]);

      const vx = Math.round(x / (20 * scaleFactor));
      const vy = Math.round(-y / (24 * scaleFactor));
      const vz = Math.round(z / (20 * scaleFactor));

      if (vx < minCoord[0]) minCoord[0] = vx;
      if (vy < minCoord[1]) minCoord[1] = vy;
      if (vz < minCoord[2]) minCoord[2] = vz;

      if (vx > maxCoord[0]) maxCoord[0] = vx;
      if (vy > maxCoord[1]) maxCoord[1] = vy;
      if (vz > maxCoord[2]) maxCoord[2] = vz;

      const legoColor = LEGO_TO_MC_MAP[colorCode];
      const blockId = legoColor ? legoColor.mcBlockId : 'minecraft:stone';

      blocks.push({ x: vx, y: vy, z: vz, blockId });
    }

    const shiftX = isFinite(minCoord[0]) ? -minCoord[0] : 0;
    const shiftY = isFinite(minCoord[1]) ? -minCoord[1] : 0;
    const shiftZ = isFinite(minCoord[2]) ? -minCoord[2] : 0;

    const normalizedBlocks = blocks.map((b) => ({
      x: b.x + shiftX,
      y: b.y + shiftY,
      z: b.z + shiftZ,
      blockId: b.blockId,
    }));

    const sizeX = Math.max(1, (maxCoord[0] - minCoord[0] + 1) || 16);
    const sizeY = Math.max(1, (maxCoord[1] - minCoord[1] + 1) || 16);
    const sizeZ = Math.max(1, (maxCoord[2] - minCoord[2] + 1) || 16);

    return {
      id: 'ldraw_' + Date.now(),
      name: `LDraw: ${modelName}`,
      description: `Converted from LDraw model with ${normalizedBlocks.length} parts.`,
      author: 'BlockCraft LDraw Bridge',
      version: '1.20.4',
      size: { x: sizeX, y: sizeY, z: sizeZ },
      regions: [
        {
          id: 'reg_lego',
          name: 'LEGO Model Bounding Box',
          bounds: { min: [0, 0, 0], max: [sizeX, sizeY, sizeZ] },
          locked: false,
          visible: true,
          color: '#10B981',
        },
      ],
      blocks: normalizedBlocks,
    };
  }, [ldrawCode, scaleFactor, modelName]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setModelName(file.name.replace(/\.[^/.]+$/, ''));
    const reader = new FileReader();
    reader.onload = () => {
      setLdrawCode(reader.result as string);
    };
    reader.readAsText(file);
  };

  const commitLDraw = async () => {
    const structure = await engine.run(async (signal, report) => {
      report('Parsing LDraw...');
      const document = await runEngineTask<any>('lego.parse', ldrawCode, undefined, signal, (_value, stage) => report(stage));
      const grid = await runEngineTask<any>('lego.blockgrid', { bricks: document.bricks }, undefined, signal, (_value, stage) => report(stage));
      return gridToStructure(grid, { name: modelName, description: 'Imported from LDraw through the CraftAIB engine.' });
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
        {/* Left Column: Code & Part Controls */}
        <div className="lg:col-span-5 bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.modelCodeLabel}</span>
            <label className="text-[11px] text-zinc-300 hover:text-white cursor-pointer flex items-center gap-1 font-mono">
              <Upload className="w-3 h-3 text-zinc-400" />
              <span>{t.uploadLdr}</span>
              <input type="file" accept=".ldr,.dat,.mpd" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-zinc-500 uppercase">{t.presets}:</span>
            <button
              onClick={() => {
                setLdrawCode(PRESET_LDRAW_MODELS.castle);
                setModelName('Classic Castle Tower');
              }}
              className="text-[11px] px-2.5 py-1 rounded-md bg-white/[0.02] border border-white/[0.06] text-zinc-300 hover:text-white"
            >
              Castle Tower
            </button>
            <button
              onClick={() => {
                setLdrawCode(PRESET_LDRAW_MODELS.rover);
                setModelName('Space Lunar Rover');
              }}
              className="text-[11px] px-2.5 py-1 rounded-md bg-white/[0.02] border border-white/[0.06] text-zinc-300 hover:text-white"
            >
              Space Rover
            </button>
          </div>

          <textarea
            value={ldrawCode}
            onChange={(e) => setLdrawCode(e.target.value)}
            rows={8}
            className="w-full studio-input rounded-md p-2.5 font-mono text-[11px] text-zinc-200 resize-none leading-relaxed"
          />

          <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.brickScaleLabel}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setScaleFactor(1)}
                className={`py-1.5 rounded-md text-xs border transition-colors ${
                  scaleFactor === 1
                    ? 'bg-white/10 border-white/20 text-white font-medium'
                    : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                }`}
              >
                1:1 Stud to Voxel
              </button>
              <button
                onClick={() => setScaleFactor(2)}
                className={`py-1.5 rounded-md text-xs border transition-colors ${
                  scaleFactor === 2
                    ? 'bg-white/10 border-white/20 text-white font-medium'
                    : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:text-white'
                }`}
              >
                2:1 Compact
              </button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-500">{t.colorMappingTitle}</span>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {Object.entries(LEGO_TO_MC_MAP).map(([code, item]) => (
                <div
                  key={code}
                  className="flex items-center justify-between p-1.5 rounded border border-white/[0.04] bg-white/[0.01] text-[11px]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-mono text-zinc-500">#{code}</span>
                    <span className="text-zinc-300">{item.name}</span>
                  </div>
                  <span className="font-mono text-zinc-400 text-[10px]">
                    {item.mcBlockId.replace('minecraft:', '')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            data-engine-commit="lego"
            onClick={() => void commitLDraw()}
            disabled={engine.isRunning}
            className="w-full py-2.5 px-4 rounded-md btn-primary text-xs font-semibold flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{engine.isRunning ? engine.progress : t.convertToStructure}</span>
          </button>
          {engine.isRunning && <button type="button" onClick={engine.cancel} className="w-full mt-2 py-1.5 text-xs border border-white/10 rounded text-zinc-300">Cancel</button>}
          {engine.error && <p role="alert" className="text-xs text-red-300 mt-2">{engine.error}</p>}
        </div>

        {/* Right Column: 3D CAD Preview */}
        <div className="lg:col-span-7 bg-[#0e1118] border border-white/[0.07] rounded-lg overflow-hidden h-[540px] flex flex-col relative">
          <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between text-xs bg-white/[0.01]">
            <span className="font-medium text-zinc-200">{modelName}</span>
            <span className="font-mono text-emerald-400 tabular-nums">
              {parsedStructure.blocks.length.toLocaleString()} {t.parsedPartsCount}
            </span>
          </div>

          <div className="flex-1 relative">
            <ThreeViewport structure={parsedStructure} />
          </div>
        </div>
      </div>
    </div>
  );
};
