import { readFile, writeFile } from 'node:fs/promises';
import { countMaterials, validateGrid, type BlockGrid } from '@craftaib/core';
import { createHtmlViewer, serializeGlb, serializeSchematic } from '../../craftmatic-adapter/dist/index.js';
import { serializeLitematica } from '../../cartographer-adapter/dist/index.js';

const [, , command, input, output, extra] = process.argv;

if (!command || command === '--help') {
  console.log('craftaib grid validate <grid.json> | craftaib materials <grid.json> [output.json] | craftaib export <format> <grid.json> <output>');
  process.exit(0);
}

async function readGrid(path: string): Promise<BlockGrid> { return validateGrid(JSON.parse(await readFile(path, 'utf8')) as BlockGrid); }
async function writeArtifact(path: string, artifact: Uint8Array | string) { await writeFile(path, typeof artifact === 'string' ? artifact : artifact); }

try {
  if (command === 'grid' && input === 'validate') {
    const grid = await readGrid(output); console.log(JSON.stringify({ ok: true, width: grid.width, height: grid.height, length: grid.length, cells: grid.cells.length }));
  } else if (command === 'materials') {
    const grid = await readGrid(input); const body = JSON.stringify(Object.fromEntries(countMaterials(grid)), null, 2); if (output) await writeFile(output, body); else console.log(body);
  } else if (command === 'export') {
    const format = input; const grid = await readGrid(output); const target = extra;
    if (!target) throw new Error('Export requires an output path.');
    let artifact: Uint8Array | string;
    if (format === 'schem') artifact = await serializeSchematic(grid);
    else if (format === 'litematic') artifact = await serializeLitematica(grid);
    else if (format === 'glb') artifact = serializeGlb(grid);
    else if (format === 'html') artifact = createHtmlViewer(grid);
    else throw new Error(`Unsupported export format: ${format}`);
    await writeArtifact(target, artifact); console.log(JSON.stringify({ ok: true, format, output: target }));
  } else { throw new Error(`Unknown command: ${command}`); }
} catch (error) { console.error(error instanceof Error ? error.message : 'Command failed.'); process.exitCode = 2; }
