import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const MIN_ASSET_BYTES = 1024;
const BUILD_CONCURRENCY = 4;
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.wasm']);

async function listAssets(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listAssets(path));
    else if (entry.isFile() && COMPRESSIBLE.has(extname(path).toLowerCase())) files.push(path);
  }
  return files;
}

async function compressAsset(path) {
  const bytes = await readFile(path);
  if (bytes.length < MIN_ASSET_BYTES) {
    await Promise.all(['.br', '.gz'].map((suffix) => rm(`${path}${suffix}`, { force: true })));
    return null;
  }
  const [br, gz] = await Promise.all([
    compressBrotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
    compressGzip(bytes, { level: 9 }),
  ]);
  await Promise.all([['.br', br], ['.gz', gz]].map(([suffix, compressed]) => compressed.length < bytes.length
    ? writeFile(`${path}${suffix}`, compressed)
    : rm(`${path}${suffix}`, { force: true })));
  return { raw: bytes.length, br: Math.min(br.length, bytes.length), gzip: Math.min(gz.length, bytes.length) };
}

const files = await listAssets(resolve(process.argv[2] || 'dist'));
const totals = { files: 0, raw: 0, br: 0, gzip: 0 };
for (let start = 0; start < files.length; start += BUILD_CONCURRENCY) {
  const compressed = await Promise.all(files.slice(start, start + BUILD_CONCURRENCY).map(compressAsset));
  for (const asset of compressed) {
    if (!asset) continue;
    totals.files++;
    for (const key of ['raw', 'br', 'gzip']) totals[key] += asset[key];
  }
}
console.log(`Precompressed static assets: ${JSON.stringify(totals)}`);
