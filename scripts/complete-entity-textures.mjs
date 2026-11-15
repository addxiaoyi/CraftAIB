import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { PNG } from 'pngjs';

const clientPath = process.argv[2];
if (!clientPath) throw new Error('Usage: node scripts/complete-entity-textures.mjs <Minecraft 1.21 client.jar>');
const clientSha1 = '0e9a07b9bb3390602f977073aa12884a4ce12431';
const bytes = await readFile(clientPath);
assert.equal(createHash('sha1').update(bytes).digest('hex'), clientSha1, 'Use the unmodified Mojang 1.21 client jar.');
const root = 'frontend/public/lodestone-default-pack';
const assets = JSON.parse(await readFile(`${root}/assets.json`, 'utf8'));
const previous = PNG.sync.read(await readFile(`${root}/atlas.png`));
const atlas = new PNG({ width: previous.width, height: Math.max(previous.height, 1344) });
PNG.bitblt(previous, atlas, 0, 0, previous.width, previous.height, 0, 0);
const woods = ['acacia', 'bamboo', 'birch', 'cherry', 'crimson', 'dark_oak', 'jungle', 'mangrove', 'oak', 'spruce', 'warped'];
const names = [...woods.map((wood) => `entity/signs/hanging/${wood}`), 'entity/player/wide/steve'];
const paths = new Set(names.map((name) => `assets/minecraft/textures/${name}.png`));
const files = unzipSync(bytes, { filter: (entry) => paths.has(entry.name) });
const hash = (pixels) => createHash('sha256').update(pixels).digest('hex');
const originalRows = 1248;
const originalPixels = hash(atlas.data.subarray(0, atlas.width * originalRows * 4));
let x = 0;
const y = 1280;
const appended = [];
for (const name of names) {
  const png = files[`assets/minecraft/textures/${name}.png`];
  assert.ok(png, `Client texture missing: ${name}`);
  const texture = PNG.sync.read(Buffer.from(png));
  const rect = [x, y, texture.width, texture.height];
  assert.ok(x + texture.width <= atlas.width && y + texture.height <= atlas.height, 'Entity texture shelf exceeds the atlas.');
  for (const [existing, [left, top, width, height]] of Object.entries(assets.textures)) {
    if (names.includes(existing)) continue;
    assert.ok(x + texture.width <= left || x >= left + width || y + texture.height <= top || y >= top + height, `${name} overlaps ${existing}`);
  }
  PNG.bitblt(texture, atlas, 0, 0, texture.width, texture.height, x, y);
  assets.textures[name] = rect;
  appended.push({ name, rect, pngSha256: hash(png), pixelsSha256: hash(texture.data) });
  x += texture.width;
}
assert.equal(hash(atlas.data.subarray(0, atlas.width * originalRows * 4)), originalPixels, 'Existing atlas pixels must remain unchanged.');
await writeFile(`${root}/assets.json`, JSON.stringify(assets));
await writeFile(`${root}/atlas.png`, PNG.sync.write(atlas));
await writeFile(`${root}/entity-textures.json`, JSON.stringify({
  version: '1.21', clientSha1,
  clientUrl: `https://piston-data.mojang.com/v1/objects/${clientSha1}/client.jar`,
  originalRows, originalPixelsSha256: originalPixels, textures: appended,
}, null, 2) + '\n');
console.log(JSON.stringify({ added: appended.length, atlas: [atlas.width, atlas.height], originalPixels }));
