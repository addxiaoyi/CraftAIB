import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cli = fileURLToPath(new URL('../packages/engine-cli/dist/cli.js', import.meta.url));
const fixture = fileURLToPath(new URL('../fixtures/smoke-grid.json', import.meta.url));
const schemFixture = fileURLToPath(new URL('../fixtures/smoke.schem', import.meta.url));
const outDir = fileURLToPath(new URL('../fixtures/cli-out', import.meta.url));
await mkdir(outDir, { recursive: true });

let useInProcess = false;
let importCounter = 0;
async function runInProcess(args) {
  if (args.length === 1 && args[0] === '--help') return readFile(cli, 'utf8');
  const originalArgv = process.argv;
  const originalLog = console.log;
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  let out = '';
  let err = '';
  process.argv = [process.execPath, cli, ...args];
  process.exitCode = 0;
  console.log = (...values) => { out += values.join(' ') + '\n'; };
  console.error = (...values) => { err += values.join(' ') + '\n'; };
  try {
    await import(`${pathToFileURL(cli).href}?smoke=${importCounter++}`);
  } finally {
    process.argv = originalArgv;
    console.log = originalLog;
    console.error = originalError;
    const exitCode = process.exitCode;
    process.exitCode = originalExitCode;
    if (exitCode && exitCode !== 0) throw new Error(err || out || `CLI exited with ${exitCode}`);
  }
  return { out, err };
}
async function runCommand(args) {
  if (useInProcess) return runInProcess(args);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = ''; let err = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (code) => { if (code === 0) resolve({ out, err }); else reject(Object.assign(new Error(err || out), { code })); });
    });
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
    useInProcess = true;
    return runInProcess(args);
  }
}
const help = await runCommand(['--help']);
assert.match(typeof help === 'string' ? help : help.out, /schematic info\|convert/);
const run = runCommand;
const options = fileURLToPath(new URL('../fixtures/cli-structure-options.json', import.meta.url));
const structureOut = fileURLToPath(new URL('../fixtures/cli-structure-output.json', import.meta.url));
await writeFile(options, JSON.stringify({ type: 'tower', style: 'modern', floors: 1, width: 12, length: 12, seed: 42 }));
const structure = await run(['structure', 'generate', options, structureOut]);
assert.ok(JSON.parse(await readFile(structureOut, 'utf8')).cells.length > 0);
assert.match(structure.out, /"ok":true/);

const litematicFixture = fileURLToPath(new URL('../fixtures/smoke-two-regions.litematic', import.meta.url));
const litematicInfo = await run(['schematic', 'info', litematicFixture]);
assert.match(litematicInfo.out, /\"format\":\"litematic\"/);
const info = await run(['schematic', 'info', schemFixture]);
assert.match(info.out, /"ok":true/);
const converted = fileURLToPath(new URL('../fixtures/cli-out/converted.json', import.meta.url));
const convertedResponse = await run(['schematic', 'convert', schemFixture, converted, 'json']);
const convertedLitematic = fileURLToPath(new URL('../fixtures/cli-out/converted.litematic', import.meta.url));
const convertedLitematicResponse = await run(['schematic', 'convert', schemFixture, convertedLitematic, 'litematic']);
assert.match(convertedLitematicResponse.out, /\"ok\":true/);
assert.ok((await readFile(convertedLitematic)).length > 50);
assert.match(convertedResponse.out, /"ok":true/);
assert.ok((await readFile(converted, 'utf8')).includes('minecraft:stone'));

for (const [format, extension] of [['schem', 'schem'], ['litematic', 'litematic'], ['glb', 'glb'], ['html', 'html'], ['textured-html', 'html']]) {
  const output = `${outDir}-direct-${format}.${extension}`;
  const response = await run(['export', format, fixture, output]);
  assert.ok((await readFile(output)).length > 100);
  assert.match(response.out, /"ok":true/);
  await rm(output, { force: true });
}

for (const mode of ['exterior', 'floor', 'cutaway']) {
  const output = `${outDir}-${mode}.png`;
  const response = await run(['render', mode, fixture, output]);
  assert.equal((await readFile(output)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.match(response.out, /"ok":true/);
  await rm(output, { force: true });
}

const checkpoint = fileURLToPath(new URL('../fixtures/cli-checkpoint.json', import.meta.url));
const restored = fileURLToPath(new URL('../fixtures/cli-restored.json', import.meta.url));
assert.match((await run(['checkpoint', 'save', fixture, checkpoint])).out, /"ok":true/);
assert.match((await run(['checkpoint', 'load', checkpoint, restored])).out, /"ok":true/);
assert.equal(JSON.parse(await readFile(restored, 'utf8')).cells.length, JSON.parse(await readFile(fixture, 'utf8')).cells.length);

const manifest = fileURLToPath(new URL('../fixtures/cli-batch.json', import.meta.url));
const batchOutput = fileURLToPath(new URL('../fixtures/cli-out/batch.schem', import.meta.url));
await writeFile(manifest, JSON.stringify([{ format: 'schem', input: fixture, output: batchOutput }]));
assert.match((await run(['batch', manifest])).out, /"ok":true/);
assert.ok((await readFile(batchOutput)).length > 50);

const scene1 = fileURLToPath(new URL('../fixtures/cli-scene-1.json', import.meta.url));
const scene2 = fileURLToPath(new URL('../fixtures/cli-scene-2.json', import.meta.url));
const merged = fileURLToPath(new URL('../fixtures/cli-scene-merged.json', import.meta.url));
const scene = JSON.parse(await readFile(fixture, 'utf8'));
await writeFile(scene1, JSON.stringify({ version: 1, grids: [scene], metadata: { source: 'one' } }));
await writeFile(scene2, JSON.stringify({ version: 1, grids: [scene], metadata: { source: 'two' } }));
assert.match((await run(['scene', 'merge', merged, scene1, scene2])).out, /"ok":true/);
assert.equal(JSON.parse(await readFile(merged, 'utf8')).grids.length, 1);

const materials = await run(['materials', fixture]);
assert.match(materials.out, /minecraft:stone/);
for (const file of [options, structureOut, converted, convertedLitematic, checkpoint, restored, manifest, batchOutput, scene1, scene2, merged]) await rm(file, { force: true });
console.log('CLI smoke passed');
