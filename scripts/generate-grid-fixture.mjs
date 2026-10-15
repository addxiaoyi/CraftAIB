import { writeFile } from 'node:fs/promises';
import { createGrid } from '../packages/core/dist/index.js';
const grid = createGrid([{ x: 0, y: 0, z: 0, block: { id: 'minecraft:stone' } }], { width: 2, height: 1, length: 1 });
await writeFile(new URL('../fixtures/smoke-grid.json', import.meta.url), JSON.stringify(grid, null, 2));
