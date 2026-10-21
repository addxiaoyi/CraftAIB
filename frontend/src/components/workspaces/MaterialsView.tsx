import React, { useState, useMemo, useEffect } from 'react';
import { StructureData, MaterialItem } from '../../types/minecraft';
import { exportMaterialsCsv } from '../../utils/exporters';
import { runEngineTask, structureToGrid } from '../../integrations/engine';
import { BLOCK_REGISTRY, BLOCK_SUBSTITUTIONS } from '../../utils/blockRegistry';
import { tr } from '../../i18n';
import {
  Package,
  Download,
  Search,
  CheckCircle2,
  ArrowRightLeft,
  Filter,
  AlertTriangle,
} from 'lucide-react';

interface MaterialsViewProps {
  structure: StructureData;
  onStructureChange: (newStructure: StructureData) => void;
  lang: 'zh' | 'en';
  initialInventory?: Record<string, number>;
  onInventoryChange?: (inventory: Record<string, number>) => void;
}

export const MaterialsView: React.FC<MaterialsViewProps> = ({
  structure,
  onStructureChange,
  lang,
  initialInventory,
  onInventoryChange,
}) => {
  const [inventories, setInventories] = useState<Record<string, number>>(initialInventory ?? {});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [shortageOnly, setShortageOnly] = useState<boolean>(false);
  const [bom, setBom] = useState<MaterialItem[]>([]);
  const [analysisState, setAnalysisState] = useState<'idle' | 'running' | 'error'>('idle');

  const base = {
    en: {
      title: 'Bill of Materials & Procurement (BOM)',
      subtitle: 'Audit solid voxel counts, 64-stacks, and 27-slot shulker boxes; track inventory gaps and execute material substitutions.',
      totalDemand: 'Total Solid Blocks',
      totalStacks: 'Standard 64-Stacks',
      totalShulkers: 'Shulker Boxes (27 Stacks)',
      shortageAlert: 'Items with Deficit',
      exportCsv: 'Export CSV Schedule',
      searchPlaceholder: 'Search block name or ID...',
      categoryAll: 'All Material Categories',
      blockColumn: 'Block Specification',
      categoryColumn: 'Category',
      requiredColumn: 'Required Count',
      breakdownColumn: 'Stack Breakdown',
      inventoryColumn: 'Current Stock',
      shortageColumn: 'Procurement Deficit',
      substitutesColumn: 'Substitutions',
      applySub: 'Apply',
      inStock: 'Fulfilled',
      shortageBadge: 'Deficit',
    },
    zh: {
      title: '建筑材料工程清单与缺口核算 (BOM)',
      subtitle: '精确核算方块总需求、标准组数 (64) 与潜影盒需求；输入库存跟踪缺口，一键执行材料平替并导出 CSV。',
      totalDemand: '方块总需求量',
      totalStacks: '标准组数 (64/组)',
      totalShulkers: '潜影盒需求 (27组/盒)',
      shortageAlert: '存在缺口的物料',
      exportCsv: '导出工程 CSV 表格',
      searchPlaceholder: '按方块名称或 ID 搜索...',
      categoryAll: '所有物料类别',
      blockColumn: '方块物料规格',
      categoryColumn: '类别',
      requiredColumn: '工程需求量',
      breakdownColumn: '组数换算',
      inventoryColumn: '当前仓储库存',
      shortageColumn: '采购缺口',
      substitutesColumn: '平替建议',
      applySub: '平替',
      inStock: '充足',
      shortageBadge: '缺口',
    },
  }[lang];
  const t = lang === 'zh' ? { ...base, title: tr(lang).pages.materials, subtitle: '统计方块需求、库存、缺口和替代材料，并导出 CSV。' } : base;

  useEffect(() => {
    onInventoryChange?.(inventories);
  }, [inventories, onInventoryChange]);

  useEffect(() => {
    let active = true;
    setAnalysisState('running');
    runEngineTask<any>('materials.analyze', structureToGrid(structure), { inventory: inventories, rules: BLOCK_SUBSTITUTIONS })
      .then((gaps) => {
        if (!active) return;
        setBom((gaps as Array<any>).map((gap) => {
          const meta = BLOCK_REGISTRY[gap.id] || { id: gap.id, name: gap.id.replace('minecraft:', '').replace(/_/g, ' '), color: '#888888', category: 'stone' };
          return { blockId: gap.id, name: meta.name, color: meta.color, category: meta.category, required: gap.required, inventory: gap.available, shortage: gap.missing, stacks: Math.floor(gap.required / 64), remainder: gap.required % 64, shulkers: +(gap.required / (64 * 27)).toFixed(2), substitutes: gap.substitutes || [] };
        }));
        setAnalysisState('idle');
      })
      .catch(() => { if (active) setAnalysisState('error'); });
    return () => { active = false; };
  }, [structure, inventories]);

  const totalBlocks = useMemo(() => {
    return bom.reduce((sum, item) => sum + item.required, 0);
  }, [bom]);

  const totalStacks = useMemo(() => {
    return Math.ceil(totalBlocks / 64);
  }, [totalBlocks]);

  const totalShulkers = useMemo(() => {
    return (totalStacks / 27).toFixed(1);
  }, [totalStacks]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    bom.forEach((item) => set.add(item.category));
    return Array.from(set);
  }, [bom]);

  const filteredItems = useMemo(() => {
    return bom.filter((item) => {
      const currentStock = inventories[item.blockId] || 0;
      const isShort = currentStock < item.required;

      if (shortageOnly && !isShort) return false;

      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchId = item.blockId.toLowerCase().includes(q);
        if (!matchName && !matchId) return false;
      }

      return true;
    });
  }, [bom, searchQuery, selectedCategory, shortageOnly, inventories]);

  const totalShortageKinds = useMemo(() => {
    return bom.filter((item) => (inventories[item.blockId] || 0) < item.required).length;
  }, [bom, inventories]);

  const handleInventoryChange = (blockId: string, val: number) => {
    setInventories((prev) => ({
      ...prev,
      [blockId]: Math.max(0, val),
    }));
  };

  const handleApplySubstitution = (targetBlockId: string, subBlockId: string) => {
    const updatedBlocks = structure.blocks.map((b) => {
      if (b.blockId === targetBlockId) {
        return { ...b, blockId: subBlockId };
      }
      return b;
    });

    onStructureChange({
      ...structure,
      blocks: updatedBlocks,
    });
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-5 lg:p-7 space-y-6 max-w-7xl mx-auto w-full bg-[#090a0f]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-white">{t.title}</h1>
          <p className="text-xs text-zinc-400 mt-1">{t.subtitle}</p>
          <p role="status" className="text-[10px] text-zinc-500 mt-1">{analysisState === 'running' ? (lang === 'zh' ? '正在通过 Worker 分析…' : 'Analyzing in Worker...') : analysisState === 'error' ? (lang === 'zh' ? '分析失败' : 'Analysis failed') : ''}</p>
        </div>

        <button
          onClick={() => exportMaterialsCsv(bom, structure.name)}
          className="px-3.5 py-1.5 rounded-md btn-primary text-xs font-semibold flex items-center gap-2 self-start sm:self-auto shrink-0 shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t.exportCsv}</span>
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg border border-white/[0.07] bg-[#0e1118]">
          <div className="text-[11px] text-zinc-400 font-mono">{t.totalDemand}</div>
          <div className="text-lg font-bold text-white mt-1 font-mono tabular-nums">
            {totalBlocks.toLocaleString()}
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-white/[0.07] bg-[#0e1118]">
          <div className="text-[11px] text-zinc-400 font-mono">{t.totalStacks}</div>
          <div className="text-lg font-bold text-emerald-400 mt-1 font-mono tabular-nums">
            {totalStacks.toLocaleString()}
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-white/[0.07] bg-[#0e1118]">
          <div className="text-[11px] text-zinc-400 font-mono">{t.totalShulkers}</div>
          <div className="text-lg font-bold text-sky-400 mt-1 font-mono tabular-nums">
            {totalShulkers} <span className="text-xs font-normal text-zinc-500">boxes</span>
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-white/[0.07] bg-[#0e1118]">
          <div className="text-[11px] text-zinc-400 font-mono">{t.shortageAlert}</div>
          <div className="text-lg font-bold text-amber-400 mt-1 font-mono tabular-nums">
            {totalShortageKinds} <span className="text-xs font-normal text-zinc-500">kinds</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full studio-input rounded-md pl-8 pr-3 py-1.5 text-xs text-white"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="studio-input rounded-md px-3 py-1.5 text-xs bg-[#0e1118] text-zinc-300 shrink-0"
          >
            <option value="all">{t.categoryAll}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShortageOnly(!shortageOnly)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0 ${
            shortageOnly
              ? 'bg-amber-400/15 border border-amber-400/30 text-amber-300'
              : 'border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{lang === 'zh' ? '仅看缺口物料' : 'Show Shortages Only'}</span>
        </button>
      </div>

      {/* Bill of Quantities Schedule Table */}
      <div className="border border-white/[0.07] rounded-lg overflow-hidden bg-[#0e1118]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.02] border-b border-white/[0.07] text-[11px] font-mono text-zinc-400 uppercase">
              <tr>
                <th className="py-2.5 px-4 font-normal">{t.blockColumn}</th>
                <th className="py-2.5 px-3 font-normal">{t.categoryColumn}</th>
                <th className="py-2.5 px-3 font-normal text-right">{t.requiredColumn}</th>
                <th className="py-2.5 px-3 font-normal">{t.breakdownColumn}</th>
                <th className="py-2.5 px-3 font-normal w-32">{t.inventoryColumn}</th>
                <th className="py-2.5 px-3 font-normal text-right">{t.shortageColumn}</th>
                <th className="py-2.5 px-4 font-normal">{t.substitutesColumn}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredItems.map((item) => {
                const stock = inventories[item.blockId] || 0;
                const deficit = Math.max(0, item.required - stock);
                const isFulfilled = deficit === 0;
                const subs = BLOCK_SUBSTITUTIONS[item.blockId] || [];

                return (
                  <tr key={item.blockId} className="hover:bg-white/[0.02] transition-colors">
                    {/* Block Name & Swatch */}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <div>
                          <div className="font-medium text-white">{item.name}</div>
                          <div className="font-mono text-[10px] text-zinc-500">{item.blockId}</div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-2.5 px-3 text-zinc-400 capitalize">{item.category}</td>

                    {/* Required Count */}
                    <td className="py-2.5 px-3 text-right font-mono text-zinc-200 tabular-nums">
                      {item.required.toLocaleString()}
                    </td>

                    {/* Stacks + Remainder */}
                    <td className="py-2.5 px-3 font-mono text-zinc-400 text-[11px] tabular-nums">
                      {item.stacks > 0 ? `${item.stacks}st ` : ''}
                      {item.remainder > 0 ? `+${item.remainder}` : ''}
                    </td>

                    {/* Current Stock Input */}
                    <td className="py-2.5 px-3">
                      <input
                        type="number"
                        min={0}
                        value={stock || ''}
                        onChange={(e) =>
                          handleInventoryChange(item.blockId, parseInt(e.target.value) || 0)
                        }
                        placeholder="0"
                        className="w-24 studio-input rounded px-2 py-1 text-xs font-mono tabular-nums text-right"
                      />
                    </td>

                    {/* Deficit */}
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {isFulfilled ? (
                        <span className="text-emerald-400 text-[11px] flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{t.inStock}</span>
                        </span>
                      ) : (
                        <span className="text-amber-400 font-semibold text-[11px]">
                          -{deficit.toLocaleString()}
                        </span>
                      )}
                    </td>

                    {/* Smart Substitution Options */}
                    <td className="py-2.5 px-4">
                      {subs.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {subs.map((subId) => {
                            const subMeta = BLOCK_REGISTRY[subId];
                            if (!subMeta) return null;
                            return (
                              <button
                                key={subId}
                                onClick={() => handleApplySubstitution(item.blockId, subId)}
                                className="px-2 py-0.5 rounded border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.08] text-[11px] text-zinc-300 flex items-center gap-1 transition-colors"
                                title={`Substitute ${item.name} with ${subMeta.name}`}
                              >
                                <div
                                  className="w-2 h-2 rounded-sm"
                                  style={{ backgroundColor: subMeta.color }}
                                />
                                <span>{subMeta.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-[11px] font-mono">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
