import { readFile } from 'node:fs/promises';
const matrix = await readFile(new URL('../docs/capability-matrix.md', import.meta.url), 'utf8');
console.log(matrix);
