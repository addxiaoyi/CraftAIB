import React, { useState } from 'react';
import { LitematicaPlacementState, StructureData } from '../../types/minecraft';
import { normalizePlacement } from '../../integrations/placement';
import { exportLitematic, exportSchematic, exportBlockGridJson, exportLDraw } from '../../utils/exporters';
import { ThreeViewport } from '../ThreeViewport';
import {
  FileCode2,
  Upload,
  ArrowRightLeft,
  Download,
  Box,
  CheckCircle,
  FileCheck,
} from 'lucide-react';

interface ProjectionsViewProps {
  currentStructure: StructureData;
  onLoadStructure: (structure: StructureData) => void;
  onImportFile: (file: File) => Promise<StructureData>;
  lang: 'zh' | 'en';
  onPlacementsChange?: (placements: LitematicaPlacementState[]) => void;
  placements?: LitematicaPlacementState[];
}

export const ProjectionsView: React.FC<ProjectionsViewProps> = ({
  currentStructure,
  onLoadStructure,
  onImportFile,
  lang,
  onPlacementsChange,
  placements = [],
}) => {
  const [importedStructure, setImportedStructure] = useState<StructureData | null>(currentStructure);
  const [sourceFormat, setSourceFormat] = useState<string>('BlockGrid CAD');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const placementInput = React.useRef<HTMLInputElement>(null);

  const handlePlacementUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      const placements = Array.isArray(value?.placements) ? value.placements.map((item: unknown, index: number) => normalizePlacement(item as Partial<LitematicaPlacementState>, index)) : [];
      if (!placements.length) throw new Error('Placement JSON contains no placements.');
      onPlacementsChange?.(placements);
      setImportStatus(lang === 'zh' ? `已导入 ${placements.length} 个 Placement` : `Imported ${placements.length} placements`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : 'Placement JSON could not be imported.');
    } finally { event.target.value = ''; }
  };

  const t = {
    en: {
      title: 'Projection Files & Format Compilation',
      subtitle: 'Parse native Litematica, WorldEdit Schematic, or BlockGrid data; inspect spatial regions and cross-compile formats.',
      dropzoneTitle: 'Import Projection File',
      dropzoneSubtitle: 'Supports .litematic, .schem, .schematic, or .json structure specifications',
      browseFiles: 'Browse File',
      loadedFile: 'Current Structure In Memory',
      metadataTitle: 'Metadata & Spatial Envelope',
      name: 'Structure Title',
      author: 'Author',
      version: 'Target Version',
      dimensions: 'Dimensions (X × Y × Z)',
      blockCount: 'Total Voxels',
      volume: 'Bounding Volume',
      regions: 'Registered Partitions',
      convertTitle: 'Cross-Format Compilation',
      convertToLitematic: 'Download Litematic (.litematic)',
      convertToSchem: 'Download Schematic (.schem)',
      convertToJson: 'Download BlockGrid (.json)',
      convertToLdr: 'Convert to LEGO LDraw (.ldr)',
      loadIntoEditor: 'Set as Active Structure in 3D Viewport',
      loadedSuccess: 'Structure successfully mounted into memory!',
    },
    zh: {
      title: '投影结构文件与跨格式编译',
      subtitle: '导入解析 Litematica、WorldEdit Schematic 与 BlockGrid 结构；查看空间分区并执行无损多格式互转。',
      dropzoneTitle: '导入投影文件',
      dropzoneSubtitle: '支持 .litematic、.schem、.schematic、.json 格式规范',
      browseFiles: '选择文件',
      loadedFile: '当前内存载入结构',
      metadataTitle: '文件元数据与空间包络',
      name: '结构名称',
      author: '创作者',
      version: '目标版本',
      dimensions: '包络外框 (X × Y × Z)',
      blockCount: '实体体素数',
      volume: '包络总体积',
      regions: '注册分区',
      convertTitle: '跨格式互转与编译',
      convertToLitematic: '下载 Litematic (.litematic)',
      convertToSchem: '下载 Schematic (.schem)',
      convertToJson: '下载 BlockGrid (.json)',
      convertToLdr: '转换为 LEGO LDraw 模型 (.ldr)',
      loadIntoEditor: '设为主视口当前活动结构',
      loadedSuccess: '结构已成功载入至 3D 工作区！',
    },
  }[lang];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Parsing structure file…');
    try {
      const normalized = await onImportFile(file);
      setImportedStructure(normalized);
      const name = file.name.toLowerCase();
      setSourceFormat(name.endsWith('.litematic') ? 'Litematica (.litematic)' : name.endsWith('.schem') ? 'Sponge Schematic (.schem)' : 'BlockGrid JSON');
      onLoadStructure(normalized);
      setImportStatus(t.loadedSuccess);
      setTimeout(() => setImportStatus(null), 3000);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : 'Structure file could not be imported.');
    }
  };

  const active = importedStructure || currentStructure;

  return (
    <div className="flex-1 h-full overflow-y-auto p-5 lg:p-7 space-y-6 max-w-7xl mx-auto w-full bg-[#090a0f]">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold tracking-tight text-white">{t.title}</h1>
        <p className="text-xs text-zinc-400 mt-1">{t.subtitle}</p>
      </div>

      {/* Upload Dropzone */}
      <div className="border border-dashed border-white/10 hover:border-white/20 bg-[#0e1118] rounded-lg p-6 text-center transition-colors">
        <Upload className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
        <h3 className="text-xs font-semibold text-zinc-200">{t.dropzoneTitle}</h3>
        <p className="text-[11px] text-zinc-500 mt-1">{t.dropzoneSubtitle}</p>
        <label className="inline-block mt-3 px-3.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 border border-white/[0.1] rounded-md text-xs font-medium cursor-pointer transition-colors shadow-sm">
          <span>{t.browseFiles}</span>
          <input
            type="file"
            accept=".json,.litematic,.schem,.schematic"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
        {importStatus && (
          <div className="mt-2 text-xs text-emerald-400 flex items-center justify-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{importStatus}</span>
          </div>
        )}
        <button type="button" onClick={() => placementInput.current?.click()} className="mt-2 px-3 py-1.5 rounded-md border border-white/10 text-xs text-zinc-300 hover:text-white">
          {lang === 'zh' ? '导入 Placement JSON' : 'Import Placement JSON'}
        </button>
        <input ref={placementInput} type="file" accept=".json,application/json" onChange={handlePlacementUpload} hidden />
      </div>

      {/* Grid: Metadata Breakdown & 3D Interactive Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Metadata Details Column */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#0e1118] border border-white/[0.07] rounded-lg p-4 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <span className="text-xs font-semibold text-white">{t.metadataTitle}</span>
              <span className="text-[11px] font-mono text-emerald-400">{sourceFormat}</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">{t.name}</span>
                <span className="text-zinc-200 font-medium">{active.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{t.author}</span>
                <span className="text-zinc-200">{active.author || 'Architect'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{t.version}</span>
                <span className="text-zinc-200 font-mono">Java {active.version || '1.20+'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{t.dimensions}</span>
                <span className="text-zinc-200 font-mono tabular-nums">
                  {active.size.x} × {active.size.y} × {active.size.z}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{t.blockCount}</span>
                <span className="text-emerald-400 font-mono font-semibold tabular-nums">
                  {active.blocks.length.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{t.volume}</span>
                <span className="text-zinc-200 font-mono tabular-nums">
                  {(active.size.x * active.size.y * active.size.z).toLocaleString()} m³
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.06]">
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
                {t.regions} ({active.regions?.length || 0})
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {active.regions?.map((reg) => (
                  <div
                    key={reg.id}
                    className="p-1.5 rounded border border-white/[0.05] bg-white/[0.01] flex items-center justify-between text-[11px]"
                  >
                    <span className="text-zinc-300 truncate">{reg.name}</span>
                    <span className="font-mono text-zinc-500 tabular-nums">
                      {reg.bounds.max[0] - reg.bounds.min[0]}×{reg.bounds.max[1] - reg.bounds.min[1]}×{reg.bounds.max[2] - reg.bounds.min[2]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => onLoadStructure(active)}
              className="w-full py-2 px-3 rounded-md btn-primary text-xs font-semibold flex items-center justify-center gap-2 mt-2"
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>{t.loadIntoEditor}</span>
            </button>
          </div>

          {/* Cross-Format Compiler */}
          <div className="bg-[#0e1118] border border-white/[0.07] rounded-lg p-4 space-y-3">
            <span className="text-xs font-semibold text-white">{t.convertTitle}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void exportLitematic(active, placements)}
                className="p-2.5 rounded border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] text-xs font-medium text-zinc-200 flex flex-col items-start gap-1 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Download className="w-3.5 h-3.5" />
                  <span className="font-mono text-[11px]">.litematic</span>
                </div>
                <span className="text-[10px] text-zinc-500">Litematica Mod</span>
              </button>

              <button
                onClick={() => void exportSchematic(active, placements)}
                className="p-2.5 rounded border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] text-xs font-medium text-zinc-200 flex flex-col items-start gap-1 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-sky-400">
                  <Download className="w-3.5 h-3.5" />
                  <span className="font-mono text-[11px]">.schem</span>
                </div>
                <span className="text-[10px] text-zinc-500">WorldEdit / FAWE</span>
              </button>

              <button
                onClick={() => exportBlockGridJson(active)}
                className="p-2.5 rounded border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] text-xs font-medium text-zinc-200 flex flex-col items-start gap-1 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Download className="w-3.5 h-3.5" />
                  <span className="font-mono text-[11px]">.json</span>
                </div>
                <span className="text-[10px] text-zinc-500">BlockGrid CAD</span>
              </button>

              <button
                onClick={() => exportLDraw(active)}
                className="p-2.5 rounded border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] text-xs font-medium text-zinc-200 flex flex-col items-start gap-1 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-indigo-400">
                  <Download className="w-3.5 h-3.5" />
                  <span className="font-mono text-[11px]">.ldr</span>
                </div>
                <span className="text-[10px] text-zinc-500">LEGO LDraw Model</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3D Visualizer Column */}
        <div className="lg:col-span-7 h-[460px] lg:h-[580px] rounded-lg overflow-hidden border border-white/[0.07] relative">
          <ThreeViewport
            structure={active}
            showRegions={true}
            className="w-full h-full"
          />
        </div>
      </div>
    </div>
  );
};
