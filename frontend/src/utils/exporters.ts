import { StructureData, MaterialItem } from '../types/minecraft';
import { runEngineTask, structureToGrid } from '../integrations/engine';
import { BLOCK_REGISTRY, BLOCK_SUBSTITUTIONS } from './blockRegistry';
import { mergePlacements } from '../integrations/placement';
import type { LitematicaPlacementState } from '../types/minecraft';

export function calculateMaterialsBOM(
  structure: StructureData,
  inventories: Record<string, number> = {}
): MaterialItem[] {
  const counts: Record<string, number> = {};

  for (const block of structure.blocks) {
    counts[block.blockId] = (counts[block.blockId] || 0) + 1;
  }

  const items: MaterialItem[] = [];

  for (const [blockId, required] of Object.entries(counts)) {
    const meta = BLOCK_REGISTRY[blockId] || {
      id: blockId,
      name: blockId.replace('minecraft:', '').replace(/_/g, ' '),
      color: '#888888',
      category: 'stone',
    };

    const inventory = inventories[blockId] || 0;
    const shortage = Math.max(0, required - inventory);
    const stacks = Math.floor(required / 64);
    const remainder = required % 64;
    const shulkers = +(required / (64 * 27)).toFixed(2);

    items.push({
      blockId,
      name: meta.name,
      color: meta.color,
      category: meta.category,
      required,
      inventory,
      shortage,
      stacks,
      remainder,
      shulkers,
      substitutes: BLOCK_SUBSTITUTIONS[blockId] || [],
    });
  }

  return items.sort((a, b) => b.required - a.required);
}

export function exportMaterialsCsv(bom: MaterialItem[], structureName: string): void {
  const header = ['Block ID', 'Block Name', 'Category', 'Required (Total)', 'Stacks (64)', 'Remainder', 'Shulker Boxes (27 stacks)', 'Current Inventory', 'Shortage Gap'];
  const rows = bom.map((item) => [
    item.blockId,
    `"${item.name}"`,
    item.category,
    item.required,
    item.stacks,
    item.remainder,
    item.shulkers,
    item.inventory,
    item.shortage,
  ]);

  const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadBlob(
    new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
    `${sanitizeFileName(structureName)}_materials_bom.csv`
  );
}

export async function exportLitematic(structure: StructureData, placements: LitematicaPlacementState[] = []): Promise<void> {
  const exportStructure = mergePlacements(structure, placements);
  const bytes = placements.length ? await runEngineTask<Uint8Array>('export', structureToGrid(exportStructure), { format: 'litematic', name: structure.name, author: structure.author, description: structure.description }) : structure.plan
    ? await runEngineTask<Uint8Array>('ai.export-plan-litematic', structure.plan)
    : await runEngineTask<Uint8Array>('export', structureToGrid(exportStructure), { format: 'litematic', name: structure.name, author: structure.author, description: structure.description });
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/gzip' }), `${sanitizeFileName(structure.name)}.litematic`);
}

export async function exportSchematic(structure: StructureData, placements: LitematicaPlacementState[] = []): Promise<void> {
  const exportStructure = mergePlacements(structure, placements);
  const bytes = await runEngineTask<Uint8Array>('export', structureToGrid(exportStructure), { format: 'schem', name: structure.name, author: structure.author, description: structure.description });
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/gzip' }), `${sanitizeFileName(structure.name)}.schem`);
}

export function exportBlockGridJson(structure: StructureData): void {
  const jsonStr = JSON.stringify(structureToGrid(structure), null, 2);
  downloadBlob(
    new Blob([jsonStr], { type: 'application/json' }),
    `${sanitizeFileName(structure.name)}_blockgrid.json`
  );
}

export function exportLDraw(structure: StructureData): void {
  const lines: string[] = [
    `0 // BlockCraft OS - LDraw Export: ${structure.name}`,
    `0 Name: ${structure.name}.ldr`,
    `0 Author: ${structure.author}`,
    `0 !LICENSE Redistributable under CC-BY-4.0`,
  ];

  for (const block of structure.blocks) {
    const legoColor = 15;
    const lduX = block.x * 20;
    const lduY = -(block.y * 24);
    const lduZ = block.z * 20;
    lines.push(`1 ${legoColor} ${lduX} ${lduY} ${lduZ} 1 0 0 0 1 0 0 0 1 3005.dat`);
  }

  const ldrContent = lines.join('\n');
  downloadBlob(
    new Blob([ldrContent], { type: 'text/plain;charset=utf-8;' }),
    `${sanitizeFileName(structure.name)}.ldr`
  );
}

function sanitizeFileName(name: string): string {
  return (name || 'structure')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
