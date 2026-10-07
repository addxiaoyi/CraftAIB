export type LDrawBrick = { color: number; x: number; y: number; z: number; rotation: number[]; part: string };
export type LDrawDocument = { bricks: LDrawBrick[]; sections: string[] };
export function parseLDraw(content: string): LDrawDocument {
  const bricks: LDrawBrick[] = []; const sections: string[] = []; let current = '__main__'; sections.push(current);
  for (const raw of content.split(/\r?\n/)) { const line = raw.trim(); if (!line) continue; if (/^0\s+FILE\s+/i.test(line)) { current = line.replace(/^0\s+FILE\s+/i, '').trim().toLowerCase(); sections.push(current); continue; } const fields = line.split(/\s+/); if (fields[0] !== '1' || fields.length < 15) continue; const values = fields.slice(1, 14).map(Number); if (values.some((value) => !Number.isFinite(value))) continue; bricks.push({ color: values[0], x: values[1], y: values[2], z: values[3], rotation: values.slice(4, 13), part: fields.slice(14).join(' ') }); }
  return { bricks, sections: [...new Set(sections)] };
}
