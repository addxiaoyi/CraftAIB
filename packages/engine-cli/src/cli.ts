import { readFile, writeFile } from 'node:fs/promises';
import { countMaterials, validateGrid, type BlockGrid } from '@craftaib/core';

const [, , command, input, output] = process.argv;

if (!command || command === '--help') {
  console.log('craftaib grid validate <file> | craftaib materials <grid.json> [output.json]');
  process.exit(0);
}

async function readGrid(path: string): Promise<BlockGrid> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as BlockGrid;
  return validateGrid(parsed);
}

if (command === 'grid' && input === 'validate') {
  const grid = await readGrid(output);
  console.log(JSON.stringify({ ok: true, width: grid.width, height: grid.height, length: grid.length, cells: grid.cells.length }));
} else if (command === 'materials') {
  const grid = await readGrid(input);
  const materials = Object.fromEntries(countMaterials(grid));
  const body = JSON.stringify(materials, null, 2);
  if (output) await writeFile(output, body);
  else console.log(body);
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}
