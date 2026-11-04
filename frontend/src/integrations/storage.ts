import type { CraftAibProject, WorkspaceId } from '../types/minecraft';
import { isWorkspaceId } from '../layout/workspaces';
import { createDefaultStructure } from '../utils/sampleStructure';
import { parseProjectJson, stringifyProjectJson, validateAiMetadata, validateHistory, validateInventory, validatePlacements, validateStructure } from './project';

export type SavedWorkbench = Pick<CraftAibProject, 'activeWorkspace' | 'language' | 'autoSave' | 'structure' | 'ai' | 'history' | 'placements' | 'materialInventory'>;
export type RestoredWorkbench = SavedWorkbench & { warnings: string[] };

export function restoreWorkbench(storage: Pick<Storage, 'getItem'>): RestoredWorkbench {
  const warnings: string[] = [];
  const read = <T>(key: string, parse: (saved: string) => T, fallback: () => T): T => {
    try {
      const saved = storage.getItem(key);
      return saved === null ? fallback() : parse(saved);
    } catch (error) {
      warnings.push(`${key}: ${error instanceof Error ? error.message : 'Browser storage could not be read.'}`);
      return fallback();
    }
  };
  return {
    activeWorkspace: read<WorkspaceId>('craftaib.active-workspace', (saved) => isWorkspaceId(saved) ? saved : 'ai_builder', () => 'ai_builder'),
    language: read<'zh' | 'en'>('craftaib.language', (saved) => saved === 'en' ? 'en' : 'zh', () => 'zh'),
    autoSave: read('craftaib.auto-save', (saved) => saved !== 'false', () => true),
    structure: read('blockcraft_current_structure', (saved) => validateStructure(parseProjectJson(saved)), createDefaultStructure),
    ai: read('craftaib.ai-meta', (saved) => validateAiMetadata(parseProjectJson(saved)), () => ({ prompt: '' })),
    history: read('craftaib.edit-history', (saved) => validateHistory(parseProjectJson(saved)), () => []),
    placements: read('craftaib.placements', (saved) => validatePlacements(parseProjectJson(saved)), () => []),
    materialInventory: read('craftaib.material-inventory', (saved) => validateInventory(parseProjectJson(saved)), () => ({})),
    warnings,
  };
}

export function persistWorkbench(storage: Pick<Storage, 'setItem' | 'removeItem'>, snapshot: SavedWorkbench, persisted: Partial<SavedWorkbench> = {}): string[] {
  const warnings: string[] = [];
  const save = (key: string, value: unknown, raw = false): boolean => {
    try {
      storage.setItem(key, raw ? String(value) : stringifyProjectJson(value));
      return true;
    } catch (error) {
      warnings.push(`${key}: ${error instanceof Error ? error.message : 'Browser storage could not be written.'}`);
      return false;
    }
  };
  const remove = (key: string) => {
    try { storage.removeItem(key); } catch (error) {
      warnings.push(`${key}: ${error instanceof Error ? error.message : 'Browser storage could not be cleared.'}`);
    }
  };
  for (const field of ['autoSave', 'activeWorkspace', 'language'] as const) {
    const key = { autoSave: 'craftaib.auto-save', activeWorkspace: 'craftaib.active-workspace', language: 'craftaib.language' }[field];
    if (persisted[field] !== snapshot[field] && save(key, snapshot[field], true)) Object.assign(persisted, { [field]: snapshot[field] });
  }
  if (!snapshot.autoSave) return warnings;

  if (persisted.structure !== snapshot.structure) {
    // Recover quota occupied by optional snapshots before risking the current structure.
    remove('craftaib.edit-history');
    delete persisted.history;
    let saved = save('blockcraft_current_structure', snapshot.structure);
    if (!saved) {
      remove('craftaib.ai-meta');
      delete persisted.ai;
      saved = save('blockcraft_current_structure', snapshot.structure);
    }
    if (!saved) return warnings;
    persisted.structure = snapshot.structure;
  }

  for (const field of ['materialInventory', 'placements', 'ai'] as const) {
    if (Object.hasOwn(persisted, field) && persisted[field] === snapshot[field]) continue;
    const key = { materialInventory: 'craftaib.material-inventory', placements: 'craftaib.placements', ai: 'craftaib.ai-meta' }[field];
    const value = snapshot[field] ?? (field === 'ai' ? { prompt: '' } : field === 'placements' ? [] : {});
    let saved = save(key, value);
    if (!saved && field === 'ai' && snapshot.ai?.referenceImage) saved = save(key, { ...snapshot.ai, referenceImage: undefined });
    if (saved) Object.assign(persisted, { [field]: snapshot[field] });
  }
  if ((!Object.hasOwn(persisted, 'history') || persisted.history !== snapshot.history)
    && save('craftaib.edit-history', (snapshot.history ?? []).slice(-5))) persisted.history = snapshot.history;
  return warnings;
}
