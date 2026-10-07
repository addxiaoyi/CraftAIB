export type LegoSet = { set_num: string; name: string; year: number; theme_id: number; num_parts: number; img_url?: string; set_url?: string };
export type LegoCatalog = { sets: LegoSet[]; themes?: Array<{ id: number; name: string; parent_id: number | null }> };

export function searchLegoCatalog(catalog: LegoCatalog, query: string, limit = 24): LegoSet[] {
  const terms = query.split(/[,;\n]+/).map((value) => value.trim().toLowerCase()).filter(Boolean); const activeTerms = terms.length ? terms : [''];
  const results = activeTerms.flatMap((term) => catalog.sets.filter((set) => { const haystack = `${set.name} ${set.set_num}`.toLowerCase(); return !term || term.split(/\s+/).every((word) => haystack.includes(word)); }).map((set) => ({ set, score: score(set, term) }))).sort((a, b) => b.score - a.score || b.set.num_parts - a.set.num_parts);
  const seen = new Set<string>(); return results.map(({ set }) => set).filter((set) => !seen.has(set.set_num) && seen.add(set.set_num)).slice(0, limit);
}

function score(set: LegoSet, query: string) { const name = set.name.toLowerCase(); const number = set.set_num.toLowerCase(); let value = 0; if (query && number === query) value += 1000; if (query && name === query) value += 400; if (query && name.startsWith(query)) value += 30; value += Math.min(60, set.num_parts / 100); value += Math.max(0, Math.min(15, (set.year - 1995) * 0.5)); return value; }
