import React, { useEffect, useRef, useState } from 'react';
import { CraftAibProject, LitematicaPlacementState, StructureData } from '../../types/minecraft';
import { ThreeViewport } from '../ThreeViewport';
import { exportLitematic, exportSchematic, exportBlockGridJson } from '../../utils/exporters';
import { generateBuilding } from '../../integrations/building';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Download,
  Image as ImageIcon,
  SlidersHorizontal,
  X,
  ArrowRight,
  Eye,
  Sliders,
  Dices,
  Layers,
  Check,
  Box,
  Compass,
} from 'lucide-react';

interface AiBuilderViewProps {
  structure: StructureData;
  onStructureChange: (newStructure: StructureData) => void;
  onNavigateTo3D: () => void;
  lang: 'zh' | 'en';
  initialAiMeta?: CraftAibProject['ai'];
  onAiMetaChange?: (meta: CraftAibProject['ai']) => void;
  placements?: LitematicaPlacementState[];
}

const PRESET_PROMPTS = [
  {
    en: 'Gothic Obsidian Watchtower with lancet windows and redstone beacon',
    zh: '带尖券拱窗与红石信标的哥特黑曜石瞭望塔',
    style: 'Gothic Fantasy',
    palette: 'Deepslate & Spruce',
    colors: ['#1e293b', '#78350f'],
    tag: 'Gothic',
  },
  {
    en: 'Minimalist Brutalist Concrete Villa with floor-to-ceiling glass atrium',
    zh: '极简清水混凝土别墅配落地玻璃中庭与水景池',
    style: 'Modern Brutalist',
    palette: 'Calcite & Quartz',
    colors: ['#f1f5f9', '#94a3b8'],
    tag: 'Brutalist',
  },
  {
    en: 'Medieval Gatehouse Fortress with portcullis arches and machicolations',
    zh: '中世纪要塞城门楼配拱券铁闸、箭垛与防御城垛',
    style: 'Medieval Fortress',
    palette: 'Stone Bricks & Dark Oak',
    colors: ['#64748b', '#451a03'],
    tag: 'Fortress',
  },
  {
    en: 'Ancient Nether Sanctum with crying obsidian runes and basalt columns',
    zh: '带哭泣黑曜石符文与玄武岩立柱的远古下界圣所',
    style: 'Nether Citadel',
    palette: 'Obsidian & Basalt',
    colors: ['#0f172a', '#334155'],
    tag: 'Nether',
  },
];

const ARCHITECTURAL_STYLES = [
  { id: 'AI_AUTO', labelZh: 'AI 自主判断', labelEn: 'AI decides', descZh: '根据描述和参考图自动判断类型、风格与材料' },
  { id: 'Gothic Fantasy', labelZh: '哥特奇幻', labelEn: 'Gothic Fantasy', descZh: '尖券拱门、飞扶壁与高耸尖塔' },
  { id: 'Modern Brutalist', labelZh: '现代粗野主义', labelEn: 'Modern Brutalist', descZh: '清水混凝土几何与大面积透光' },
  { id: 'Medieval Fortress', labelZh: '中世纪要塞', labelEn: 'Medieval Fortress', descZh: '厚重石砖、堞口箭孔与防御门楼' },
  { id: 'Nether Citadel', labelZh: '下界黑曜堡垒', labelEn: 'Nether Citadel', descZh: '黑曜石符文、岩浆柱与玄武岩立面' },
  { id: 'Oriental Pagoda', labelZh: '新中式飞檐重楼', labelEn: 'Oriental Pagoda', descZh: '重檐歇山、榫卯结构与庭院连廊' },
];

const PALETTE_THEMES = [
  { id: 'AI_AUTO', labelZh: 'AI 自主配色', labelEn: 'AI decides', colors: ['#64748b', '#10b981'], desc: 'Infer materials from the brief and reference image' },
  {
    id: 'Deepslate & Spruce',
    labelZh: '深板岩与云杉木',
    labelEn: 'Deepslate & Spruce',
    colors: ['#1e293b', '#78350f'],
    desc: 'Deepslate, spruce, lantern',
  },
  {
    id: 'Calcite & Quartz',
    labelZh: '方解石与平滑石英',
    labelEn: 'Calcite & Quartz',
    colors: ['#f8fafc', '#cbd5e1'],
    desc: 'Calcite, smooth quartz, glass',
  },
  {
    id: 'Stone Bricks & Dark Oak',
    labelZh: '石砖与深色橡木',
    labelEn: 'Stone Bricks & Dark Oak',
    colors: ['#64748b', '#3b1d11'],
    desc: 'Chiseled stone, dark oak, iron',
  },
  {
    id: 'Obsidian & Basalt',
    labelZh: '哭泣黑曜石与玄武岩',
    labelEn: 'Obsidian & Basalt',
    colors: ['#0f172a', '#475569'],
    desc: 'Obsidian, smooth basalt, shroomlight',
  },
  {
    id: 'Copper & Prismarine',
    labelZh: '氧化铜与海晶石',
    labelEn: 'Copper & Prismarine',
    colors: ['#b45309', '#0d9488'],
    desc: 'Waxed cut copper, prismarine, sea lantern',
  },
];

const QUICK_TAGS = [
  { zh: '+ 哥特尖塔', en: '+ Gothic Spire' },
  { zh: '+ 落地玻璃中庭', en: '+ Glass Atrium' },
  { zh: '+ 红石信标', en: '+ Redstone Beacon' },
  { zh: '+ 护城河与吊桥', en: '+ Moat & Drawbridge' },
  { zh: '+ 挑空内殿', en: '+ Vaulted Nave' },
];

export const AiBuilderView: React.FC<AiBuilderViewProps> = ({
  structure,
  onStructureChange,
  onNavigateTo3D,
  lang,
  initialAiMeta,
  onAiMetaChange,
  placements = [],
}) => {
  const [prompt, setPrompt] = useState<string>(initialAiMeta?.prompt ?? '');
  const [referenceImage, setReferenceImage] = useState<string | null>(initialAiMeta?.referenceImage ?? null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generationSource, setGenerationSource] = useState<'ai' | 'local' | null>(null);
  const [allowLocalPreview, setAllowLocalPreview] = useState<boolean>(false);
  const abortController = useRef<AbortController | null>(null);

  // Responsive mobile active view: 'controls' | 'viewport'
  const [mobileTab, setMobileTab] = useState<'controls' | 'viewport'>('controls');

  const [dimX, setDimX] = useState<number>(16);
  const [dimY, setDimY] = useState<number>(24);
  const [dimZ, setDimZ] = useState<number>(16);
  const [style, setStyle] = useState<string>('AI_AUTO');
  const [paletteTheme, setPaletteTheme] = useState<string>('AI_AUTO');
  const [complexity, setComplexity] = useState<string>('Detailed');

  const [minY, setMinY] = useState<number>(0);
  const [maxY, setMaxY] = useState<number>(structure.size.y);
  const [wireframe, setWireframe] = useState<boolean>(false);

  useEffect(() => {
    setPrompt(initialAiMeta?.prompt ?? '');
    setReferenceImage(initialAiMeta?.referenceImage ?? null);
  }, [initialAiMeta]);

  useEffect(() => {
    onAiMetaChange?.({ prompt, referenceImage: referenceImage ?? undefined, source: generationSource ?? undefined });
  }, [prompt, referenceImage, generationSource, onAiMetaChange]);

  const base = {
    en: {
      headline: 'Generative Architecture Workbench',
      subtitle: 'Synthesize production-grade Minecraft Java 1.20+ structures from technical prompts and imagery.',
      promptPlaceholder: 'Describe architectural morphology, materials, spires, arches, rooms, and lighting...',
      uploadPhoto: 'Drop Architectural Reference Image',
      clearPhoto: 'Clear',
      generateBtn: 'Synthesize Architecture',
      generating: 'Computing 3D Voxel Matrix...',
      settingsTitle: 'Structural Envelope & Architectural Parameters',
      width: 'Span X',
      height: 'Height Y',
      depth: 'Depth Z',
      styleLabel: 'Architectural Style',
      paletteLabel: 'Material Palette Palette',
      complexityLabel: 'Detail & Layering Density',
      quickPresets: 'Curated Architectural Presets',
      regionSummary: 'Spatial Partitions Schedule',
      exportLitematic: 'Download .litematic',
      exportSchem: '.schem (WorldEdit)',
      exportJson: '.json (BlockGrid)',
      editIn3D: 'Launch Full 3D CAD Editor',
      randomPrompt: 'Random Inspiration',
      blocksCount: 'Total Voxels',
      tabControls: 'Architectural Brief',
      tabViewport: '3D Spatial Viewport',
      quickTags: 'Prompt Modifiers',
      layerSlice: 'Layer Height Slice',
    },
    zh: {
      headline: '生成式建筑计算引擎',
      subtitle: '输入建筑学构想或上传设计意向图，AI 即时解算并合成标准 Java 1.20+ 体素模型。',
      promptPlaceholder: '描述建筑形态、体量层高、空间功能、门窗柱廊与核心材质（如：带挑空大厅与尖券拱的深板岩主楼）...',
      uploadPhoto: '载入设计参考/意向效果图',
      clearPhoto: '清除图片',
      generateBtn: '合成三维建筑结构',
      generating: '正在解算三维体素空间矩阵...',
      settingsTitle: '空间包络与建筑学参数',
      width: '跨度 X (宽)',
      height: '标高 Y (高)',
      depth: '进深 Z (长)',
      styleLabel: '建筑学流派',
      paletteLabel: '材质色彩调色板',
      complexityLabel: '细节雕琢与层次密度',
      quickPresets: '精选建筑方案预设',
      regionSummary: '空间功能分区表 (Partitions)',
      exportLitematic: '导出 .litematic 投影文件',
      exportSchem: '.schem (WorldEdit 结构)',
      exportJson: '.json (BlockGrid 体素)',
      editIn3D: '进入完整 3D CAD 编辑台',
      randomPrompt: '灵感骰子',
      blocksCount: '总方块数',
      tabControls: '建筑方案面板',
      tabViewport: '3D 空间视口',
      quickTags: '构件修饰词',
      layerSlice: '高度切片',
    },
  }[lang];
  const t = lang === 'zh' ? {
    ...base,
    headline: 'AI 建筑生成器', subtitle: '用文字和参考图生成 Minecraft 建筑，并导出投影文件。',
    promptPlaceholder: '描述建筑风格、材料、房间、屋顶、塔楼和环境……', uploadPhoto: '添加参考图', clearPhoto: '移除',
    generateBtn: '生成建筑', generating: '正在生成建筑结构……', settingsTitle: '生成设置',
    width: '宽度 X', height: '高度 Y', depth: '长度 Z', styleLabel: '建筑风格', paletteLabel: '材料主题',
    complexityLabel: '细节密度', quickPresets: '建筑预设', regionSummary: '区域摘要',
    exportLitematic: '导出 .litematic', exportSchem: '导出 .schem', exportJson: '导出 .json',
    editIn3D: '在 3D 查看器中编辑', randomPrompt: '随机灵感', blocksCount: '方块数量',
    tabControls: '建筑描述', tabViewport: '3D 预览', quickTags: '快速标签', layerSlice: '高度切片',
  } : base;

  const generationCopy = lang === 'zh'
    ? { cancel: '取消生成', local: '改用本地预览', ai: 'AI 规划', localSource: '本地预览 · 未使用模型' }
    : { cancel: 'Cancel generation', local: 'Create local preview', ai: 'AI plan', localSource: 'Local preview · no model used' };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setReferenceImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRandomize = () => {
    const randomPreset = PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)];
    setPrompt(lang === 'zh' ? randomPreset.zh : randomPreset.en);
    setStyle(randomPreset.style);
    setPaletteTheme(randomPreset.palette);
  };

  const handleAppendTag = (tag: string) => {
    const clean = tag.replace('+', '').trim();
    if (prompt.includes(clean)) return;
    setPrompt((prev) => (prev ? `${prev}，${clean}` : clean));
  };

  const handleGenerate = async (forceLocal = false) => {
    if (!prompt.trim() && !referenceImage) {
      setErrorMessage('Describe the building or add a reference image.');
      return;
    }

    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    setIsLoading(true);
    setErrorMessage(null);
    setAllowLocalPreview(false);
    setGenerationSource(null);
    setLoadingStep(forceLocal ? 'Creating a local preview…' : 'Checking model service…');

    try {
      const styleId = style === 'AI_AUTO' ? '' : style.toLowerCase().includes('gothic') ? 'gothic'
        : style.toLowerCase().includes('medieval') ? 'medieval'
        : style.toLowerCase().includes('modern') || style.toLowerCase().includes('brutalist') ? 'modern'
        : style.toLowerCase().includes('oriental') ? 'colonial'
        : style.toLowerCase().includes('nether') ? 'underwater' : 'fantasy';
      const result = await generateBuilding({
        prompt: [prompt, styleId ? `Architectural style: ${styleId}` : '', paletteTheme === 'AI_AUTO' ? '' : 'Palette: ' + paletteTheme, 'Complexity: ' + complexity].filter(Boolean).join('. '),
        referenceImage: referenceImage ?? undefined,
        type: '',
        style: styleId,
        floors: Math.max(1, Math.min(12, Math.round(dimY / 6))),
        width: dimX,
        length: dimZ,
        seed: 42,
      }, controller.signal, (value, stage) => setLoadingStep(Math.round(value * 100) + '% · ' + stage), forceLocal);
      onStructureChange(result.structure);
      setMaxY(result.structure.size.y);
      setMinY(0);
      setGenerationSource(result.source);
      setMobileTab('viewport');
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      setErrorMessage(cancelled ? 'Generation cancelled. Your inputs are preserved.' : error instanceof Error ? error.message : 'Structure generation failed.');
      setAllowLocalPreview(!forceLocal && !cancelled);
    } finally {
      if (abortController.current === controller) abortController.current = null;
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleCancelGeneration = () => abortController.current?.abort();

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col bg-[#07090e]">
      {/* Mobile Adaptive Top Segmented Tab Switcher (< lg) */}
      <div className="lg:hidden flex items-center justify-between p-2 border-b border-white/[0.07] bg-[#0c0f17]/95 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.08] p-0.5 rounded-lg w-full">
          <button
            onClick={() => setMobileTab('controls')}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === 'controls'
                ? 'bg-white/10 text-white shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t.tabControls}</span>
          </button>
          <button
            onClick={() => setMobileTab('viewport')}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === 'viewport'
                ? 'bg-white/10 text-white shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.tabViewport}</span>
          </button>
        </div>
      </div>

      {/* Main Studio Frame: Split side-by-side on lg+ */}
      <div className="flex-1 h-full overflow-hidden flex flex-col lg:flex-row relative">
        {/* Left Column: Brief & Generator Console */}
        <aside
          className={`w-full lg:w-[420px] xl:w-[450px] shrink-0 h-full border-r border-white/[0.07] bg-[#0c0f17] flex flex-col overflow-y-auto ${
            mobileTab === 'viewport' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="p-4 sm:p-5 lg:p-6 space-y-4 sm:space-y-5">
            {/* Headline with Architectural Badge */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  Java 1.20+ Engine
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  CAD Voxel Synthesis
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white">{t.headline}</h1>
              <p className="text-xs text-zinc-400 leading-relaxed">{t.subtitle}</p>
            </div>

            {/* Architectural Prompt Card */}
            <div className="space-y-2.5">
              <div className="relative group">
                <textarea
                  data-ai-prompt="true"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t.promptPlaceholder}
                  rows={3}
                  className="w-full studio-input rounded-lg p-3 text-xs text-zinc-100 placeholder-zinc-500 resize-none leading-relaxed transition-all focus:border-emerald-500/40"
                />
                <div className="absolute right-2 bottom-2.5 flex items-center gap-1.5">
                  {prompt && (
                    <button
                      onClick={() => setPrompt('')}
                      className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Clear"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={handleRandomize}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-mono text-zinc-300 hover:text-white transition-colors border border-white/[0.06]"
                    title={t.randomPrompt}
                  >
                    <Dices className="w-3 h-3 text-emerald-400" />
                    <span>{t.randomPrompt}</span>
                  </button>
                </div>
              </div>

              {/* Quick Prompt Modifiers Chips */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TAGS.map((tag, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAppendTag(lang === 'zh' ? tag.zh : tag.en)}
                    className="px-2 py-0.5 rounded-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.14] text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                  >
                    {lang === 'zh' ? tag.zh : tag.en}
                  </button>
                ))}
              </div>

              {/* Reference Image Dropzone */}
              {referenceImage ? (
                <div className="relative h-18 rounded-lg overflow-hidden border border-emerald-500/30 bg-emerald-950/10 flex items-center justify-between p-2.5">
                  <div className="flex items-center gap-3">
                    <img
                      src={referenceImage}
                      alt="Reference"
                      className="w-14 h-13 object-cover rounded-md border border-white/10"
                    />
                    <div>
                      <div className="text-xs font-semibold text-emerald-300">
                        {lang === 'zh' ? '设计参考图已绑定' : 'Reference Image Loaded'}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                        {lang === 'zh' ? '体素解算将提取形态与配色' : 'Voxel lattice extracts visual cues'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setReferenceImage(null)}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                    title={t.clearPhoto}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="border border-dashed border-white/12 hover:border-emerald-500/40 rounded-lg p-2.5 flex items-center justify-center gap-2 cursor-pointer transition-all bg-white/[0.01] hover:bg-emerald-500/[0.02] group">
                  <ImageIcon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                  <span className="text-xs text-zinc-300 group-hover:text-white transition-colors">{t.uploadPhoto}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">PNG / JPG</span>
                  <input
                    data-reference-image="true"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              )}

              {/* Curated Presets Grid */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                  <span>{t.quickPresets}</span>
                  <span className="text-zinc-500 font-normal">Click to apply</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRESET_PROMPTS.map((p, idx) => {
                    const isSelected = style === p.style && paletteTheme === p.palette;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setPrompt(lang === 'zh' ? p.zh : p.en);
                          setStyle(p.style);
                          setPaletteTheme(p.palette);
                        }}
                        className={`text-left p-2 rounded-lg border transition-all relative overflow-hidden group cursor-pointer ${
                          isSelected
                            ? 'border-emerald-500/50 bg-emerald-500/[0.08] shadow-sm'
                            : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold text-zinc-200 group-hover:text-white truncate">
                            {p.tag}
                          </span>
                          <div className="flex items-center -space-x-1 shrink-0">
                            {p.colors.map((c, ci) => (
                              <span
                                key={ci}
                                className="w-2.5 h-2.5 rounded-full border border-black/40"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {p.palette}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Generation Parameters Section */}
            <div className="border border-white/[0.07] rounded-lg overflow-hidden bg-white/[0.01]">
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="w-full flex items-center justify-between p-3 text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t.settingsTitle}</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400 font-mono text-[11px]">
                  <span className="tabular-nums">{dimX}×{dimY}×{dimZ}</span>
                  {isSettingsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </button>

              {isSettingsOpen && (
                <div className="p-3.5 pt-0 space-y-4 border-t border-white/[0.05] animate-fade-in text-xs">
                  {/* Rapid Aspect Envelope Presets */}
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span>{lang === 'zh' ? '包络预设尺寸' : 'Envelope Size Presets'}</span>
                      <span className="text-zinc-500">X × Y × Z</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: '16×24×16', x: 16, y: 24, z: 16, sub: lang === 'zh' ? '紧凑型' : 'Compact' },
                        { label: '24×32×24', x: 24, y: 32, z: 24, sub: lang === 'zh' ? '标准级' : 'Standard' },
                        { label: '32×48×32', x: 32, y: 48, z: 32, sub: lang === 'zh' ? '宏伟级' : 'Monument' },
                      ].map((preset) => {
                        const isCurrent = dimX === preset.x && dimY === preset.y && dimZ === preset.z;
                        return (
                          <button
                            key={preset.label}
                            onClick={() => {
                              setDimX(preset.x);
                              setDimY(preset.y);
                              setDimZ(preset.z);
                            }}
                            className={`p-1.5 rounded-md border text-center transition-all ${
                              isCurrent
                                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 font-semibold'
                                : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                            }`}
                          >
                            <div className="font-mono text-[11px] tabular-nums">{preset.label}</div>
                            <div className="text-[9px] text-zinc-500 mt-0.5">{preset.sub}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Fine Dimension Sliders */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-400 font-mono mb-1">
                        <span>{t.width}</span>
                        <span className="text-white tabular-nums">{dimX}</span>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={36}
                        value={dimX}
                        onChange={(e) => setDimX(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-400 font-mono mb-1">
                        <span>{t.height}</span>
                        <span className="text-white tabular-nums">{dimY}</span>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={64}
                        value={dimY}
                        onChange={(e) => setDimY(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-400 font-mono mb-1">
                        <span>{t.depth}</span>
                        <span className="text-white tabular-nums">{dimZ}</span>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={36}
                        value={dimZ}
                        onChange={(e) => setDimZ(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Architectural Style Archetypes */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-zinc-400 block">{t.styleLabel}</label>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {ARCHITECTURAL_STYLES.map((st) => (
                        <button
                          key={st.id}
                          onClick={() => setStyle(st.id)}
                          className={`w-full flex items-center justify-between p-2 rounded-md border text-left transition-all ${
                            style === st.id
                              ? 'border-emerald-500/50 bg-emerald-500/10 text-white font-medium'
                              : 'border-white/[0.05] bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-medium text-zinc-200">
                              {lang === 'zh' ? st.labelZh : st.labelEn}
                            </div>
                            <div className="text-[10px] text-zinc-500">{st.descZh}</div>
                          </div>
                          {style === st.id && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Material Palette Themes */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-zinc-400 block">{t.paletteLabel}</label>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {PALETTE_THEMES.map((pal) => (
                        <button
                          key={pal.id}
                          onClick={() => setPaletteTheme(pal.id)}
                          className={`w-full flex items-center justify-between p-2 rounded-md border text-left transition-all ${
                            paletteTheme === pal.id
                              ? 'border-emerald-500/50 bg-emerald-500/10 text-white font-medium'
                              : 'border-white/[0.05] bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex items-center -space-x-1 shrink-0">
                              {pal.colors.map((c, ci) => (
                                <span
                                  key={ci}
                                  className="w-3 h-3 rounded-full border border-black/50"
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                            <div>
                              <div className="text-xs font-medium text-zinc-200">
                                {lang === 'zh' ? pal.labelZh : pal.labelEn}
                              </div>
                              <div className="text-[10px] text-zinc-500">{pal.desc}</div>
                            </div>
                          </div>
                          {paletteTheme === pal.id && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Complexity Density */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-zinc-400 block">{t.complexityLabel}</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['Minimal', 'Standard', 'Detailed'].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setComplexity(lvl)}
                          className={`py-1.5 rounded-md text-xs font-medium transition-all ${
                            complexity === lvl
                              ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                              : 'bg-white/[0.03] text-zinc-400 hover:text-white border border-white/[0.06]'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Synthesize Action Button */}
            <div className="space-y-2">
              <button
                data-ai-generate="true"
                onClick={() => void handleGenerate()}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg btn-primary text-xs font-bold tracking-wide flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                    <span>{loadingStep || t.generating}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>{t.generateBtn}</span>
                  </>
                )}
              </button>

              {isLoading && (
                <button onClick={handleCancelGeneration} className="w-full py-2 rounded-md border border-white/10 text-xs text-zinc-300 hover:bg-white/5">
                  {generationCopy.cancel}
                </button>
              )}

              {generationSource && (
                <p className={`text-[11px] ${generationSource === 'ai' ? 'text-emerald-400' : 'text-amber-400'}`} role="status">
                  {generationSource === 'ai' ? generationCopy.ai : generationCopy.localSource}
                </p>
              )}

              {allowLocalPreview && !isLoading && (
                <button onClick={() => void handleGenerate(true)} className="w-full py-2 rounded-md border border-amber-500/30 text-xs text-amber-300 hover:bg-amber-500/10">
                  {generationCopy.local}
                </button>
              )}

              {errorMessage && (
                <div className="text-xs text-red-400 p-2.5 rounded-lg bg-red-950/40 border border-red-800/50 leading-relaxed">
                  {errorMessage}
                </div>
              )}
            </div>

            {/* Spatial Partitions Schedule */}
            <div className="pt-2 border-t border-white/[0.07] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t.regionSummary}</span>
                </span>
                <span className="text-[11px] font-mono text-emerald-400 font-semibold tabular-nums">
                  {structure.regions?.length || 0} {lang === 'zh' ? '个分区' : 'regions'}
                </span>
              </div>

              {structure.plan?.notes?.length ? <div className="rounded border border-white/[0.06] bg-white/[0.02] p-2 text-[10px] text-zinc-400">{structure.plan.notes.join(' ')}</div> : null}

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {structure.regions?.map((reg) => (
                  <div
                    key={reg.id}
                    className="p-2 rounded-lg border border-white/[0.05] bg-white/[0.02] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: reg.color || '#3b82f6' }}
                      />
                      <span className="font-medium text-zinc-200 truncate">{reg.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-zinc-500 shrink-0 tabular-nums">
                      [{reg.bounds.min.join(',')}] → [{reg.bounds.max.join(',')}]
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Export & Full CAD Jump */}
            <div className="pt-2 border-t border-white/[0.07] space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  data-ai-export="litematic"
                  onClick={() => void exportLitematic(structure, placements)}
                  className="py-2 px-2.5 rounded-lg btn-secondary text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>.litematic</span>
                </button>
                <button
                  data-ai-export="schematic"
                  onClick={() => void exportSchematic(structure, placements)}
                  className="py-2 px-2.5 rounded-lg btn-secondary text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-zinc-400" />
                  <span>.schem</span>
                </button>
              </div>

              <button
                onClick={onNavigateTo3D}
                className="w-full py-2.5 px-3 rounded-lg border border-white/12 hover:border-emerald-500/40 bg-white/[0.03] hover:bg-emerald-500/[0.05] text-xs font-semibold text-zinc-100 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>{t.editIn3D}</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
              </button>
            </div>
          </div>
        </aside>

        {/* Center / Right Column: Immersive 3D Spatial Viewport */}
        <main
          className={`flex-1 h-full flex flex-col relative overflow-hidden bg-[#07090e] ${
            mobileTab === 'controls' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Viewport Canvas with interactive Orbit */}
          <div className="flex-1 relative">
            <ThreeViewport
              structure={structure}
              minY={minY}
              maxY={maxY}
              wireframe={wireframe}
              showRegions={true}
              className="w-full h-full"
            />

            {/* Floating Minimal Bottom Slicing Drawer */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 studio-glass px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg shadow-2xl flex items-center gap-3 sm:gap-4 text-xs z-10 border border-white/[0.08] max-w-[calc(100%-24px)] overflow-x-auto">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] sm:text-[11px] text-zinc-400 whitespace-nowrap">{t.layerSlice}</span>
                <input
                  type="range"
                  min={0}
                  max={structure.size.y}
                  value={maxY}
                  onChange={(e) => setMaxY(Number(e.target.value))}
                  className="w-24 sm:w-32 accent-white"
                />
                <span className="font-mono text-[10px] sm:text-[11px] text-emerald-400 font-semibold w-8 tabular-nums">
                  {maxY}/{structure.size.y}
                </span>
              </div>

              <div className="w-[1px] h-3.5 bg-white/10 shrink-0" />

              <button
                onClick={() => setWireframe(!wireframe)}
                className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono transition-colors shrink-0 cursor-pointer ${
                  wireframe ? 'bg-white/20 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {wireframe ? 'Wireframe: ON' : 'Wireframe: OFF'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
