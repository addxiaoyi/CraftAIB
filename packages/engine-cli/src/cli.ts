import { readFile, writeFile } from 'node:fs/promises';
import { countMaterials, validateGrid, type BlockGrid } from '@craftaib/core';
import { generateMapArt } from '../../cartographer-adapter/dist/index.js';
import { geoJsonToScene, geoSceneToBlockGrid, ldrawToBlockGrid, parseLDraw, createHtmlViewer, serializeGlb, serializeSchematic } from '../../craftmatic-adapter/dist/index.js';
import { serializeLitematica } from '../../cartographer-adapter/dist/index.js';

const [, , command, input, output, extra] = process.argv;
if (!command || command === '--help') { console.log('craftaib grid validate <grid.json> | materials <grid.json> [output.json] | export <format> <grid.json> <output> | map-art <pixel.json> <output.json> | geo <geojson> <output.json> | lego <model.ldr> <output.json>'); process.exit(0); }
async function readGrid(path: string): Promise<BlockGrid> { return validateGrid(JSON.parse(await readFile(path, 'utf8')) as BlockGrid); }
async function writeJson(path: string, value: unknown) { await writeFile(path, JSON.stringify(value, null, 2)); }
async function writeArtifact(path: string, artifact: Uint8Array | string) { await writeFile(path, typeof artifact === 'string' ? artifact : artifact); }
try {
  if (command === 'grid' && input === 'validate') { const grid = await readGrid(output); console.log(JSON.stringify({ ok: true, width: grid.width, height: grid.height, length: grid.length, cells: grid.cells.length })); }
  else if (command === 'materials') { const grid = await readGrid(input); const body = JSON.stringify(Object.fromEntries(countMaterials(grid)), null, 2); if (output) await writeFile(output, body); else console.log(body); }
  else if (command === 'export') { const format = input; const grid = await readGrid(output); if (!extra) throw new Error('Export requires an output path.'); let artifact: Uint8Array | string; if (format === 'schem') artifact = await serializeSchematic(grid); else if (format === 'litematic') artifact = await serializeLitematica(grid); else if (format === 'glb') artifact = serializeGlb(grid); else if (format === 'html') artifact = createHtmlViewer(grid); else throw new Error(`Unsupported export format: ${format}`); await writeArtifact(extra, artifact); console.log(JSON.stringify({ ok: true, format, output: extra })); }
  else if (command === 'map-art') { const inputData = JSON.parse(await readFile(input, 'utf8')); const grid = generateMapArt(inputData.pixelMap, inputData.options); await writeJson(output, grid); console.log(JSON.stringify({ ok: true, output, cells: grid.cells.length })); }
  else if (command === 'geo') { const source = JSON.parse(await readFile(input, 'utf8')); const options = JSON.parse(extra ?? '{"center":{"lat":0,"lng":0},"width":128,"length":128}'); await writeJson(output, geoSceneToBlockGrid(geoJsonToScene(source, options))); console.log(JSON.stringify({ ok: true, output })); }
  else if (command === 'lego') { const bricks = parseLDraw(await readFile(input, 'utf8')).bricks; await writeJson(output, ldrawToBlockGrid(bricks, {})); console.log(JSON.stringify({ ok: true, output, bricks: bricks.length })); }
  else throw new Error(`Unknown command: ${command}`);
} catch (error) { console.error(error instanceof Error ? error.message : 'Command failed.'); process.exitCode = 2; }
