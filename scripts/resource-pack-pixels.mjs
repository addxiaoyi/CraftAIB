import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { PNG } from 'pngjs';

export function texturePng(width, height, pixel) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) png.data.set(pixel(x, y), (y * width + x) * 4);
  return PNG.sync.write(png);
}

export const json = (value) => new TextEncoder().encode(JSON.stringify(value));
export const packZip = (files) => Buffer.from(zipSync(files));
export const magenta = texturePng(64, 64, () => [255, 0, 255, 255]);
export const stoneModel = { parent: 'minecraft:block/cube_all', textures: { all: 'acceptance:block/paint' } };
export const customPack = {
  'assets/minecraft/blockstates/stone.json': json({ variants: { '': { model: 'acceptance:block/painted' } } }),
  'assets/acceptance/models/block/painted.json': json(stoneModel),
  'assets/acceptance/textures/block/paint.png': magenta,
};

export async function inspectPackPixels(page) {
  const bundle = await build({ stdin: { contents: "export { loadDefaultPackCached, decodePackCached } from './frontend/src/integrations/resourcePack'; export { Identifier } from '@mattzh72/lodestone';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'packProbe', platform: 'browser', logLevel: 'silent' });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const animated = {
    ...customPack,
    'assets/acceptance/textures/block/paint.png': texturePng(64, 128, (x, y) => y < 64 ? [255, 0, 0, 255] : [0, 255, 0, x < 32 ? 0 : 255]),
    'assets/acceptance/textures/block/paint.png.mcmeta': json({ animation: { frames: [1, 0] } }),
  };
  const probe = await page.evaluate(async (bytes) => {
    const defaults = await packProbe.loadDefaultPackCached(`${location.origin}/lodestone-default-pack/`);
    const pack = await packProbe.decodePackCached(new File([new Uint8Array(bytes)], 'probe.zip'), defaults);
    const original = defaults.atlas.imageData;
    const atlas = pack.getTextureAtlas();
    let changedDefaultPixels = 0;
    for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width * 4; x++) {
      if (original.data[y * original.width * 4 + x] !== atlas.data[y * atlas.width * 4 + x]) changedDefaultPixels++;
    }
    const uv = pack.getTextureUV(packProbe.Identifier.parse('acceptance:block/paint'));
    const x = Math.round(uv[0] * atlas.width);
    const y = Math.round(uv[1] * atlas.height);
    const pixel = (dx) => Array.from(atlas.data.slice((y * atlas.width + x + dx) * 4, (y * atlas.width + x + dx) * 4 + 4));
    const glassId = packProbe.Identifier.parse('minecraft:glass');
    const glowstoneId = packProbe.Identifier.parse('minecraft:glowstone');
    return { changedDefaultPixels, frameSize: [Math.round((uv[2] - uv[0]) * atlas.width), Math.round((uv[3] - uv[1]) * atlas.height)], transparentPixel: pixel(2), opaquePixel: pixel(48), glass: pack.getBlockFlags(glassId), defaultGlass: defaults.resources.getBlockFlags(glassId), glowstone: pack.getBlockFlags(glowstoneId), defaultGlowstone: defaults.resources.getBlockFlags(glowstoneId) };
  }, [...packZip(animated)]);
  assert.equal(probe.changedDefaultPixels, 0, 'A custom pack must preserve every bundled pixel, including the right side of the atlas.');
  assert.deepEqual(probe.frameSize, [64, 64], 'Keep high-resolution frame dimensions.');
  assert.equal(probe.transparentPixel[3], 0);
  assert.deepEqual(probe.opaquePixel, [0, 255, 0, 255], 'Use the first frame declared by mcmeta.');
  assert.deepEqual(probe.glass, probe.defaultGlass, 'Keep glass transparency and culling.');
  assert.deepEqual(probe.glowstone, probe.defaultGlowstone, 'Keep emission flags.');
  return probe;
}

export function countPixels(bytes, matches) {
  const png = PNG.sync.read(bytes);
  let count = 0;
  for (let i = 0; i < png.data.length; i += 4) if (matches(...png.data.subarray(i, i + 4))) count++;
  return count;
}
