import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  stdin: {
    contents: "export * from './frontend/src/components/viewportCamera.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const { frameViewport, isReferenceFacing, viewportCameraKey, viewportCameraPosition, viewportFocus } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

const center = [10, 12, 8];
const size = 24;
const standardFacing = [
  ['front', [10, 12, 51.2]],
  ['side', [53.2, 12, 8]],
  ['iso', [41.2, 36, 39.2]],
  ['top', [10, 60, 8.01]],
];

for (const [view, expected] of standardFacing) {
  assert.deepEqual(viewportCameraPosition(center, size, view, 'z-max').map((value) => Number(value.toFixed(3))), expected);
  assert.deepEqual(viewportCameraPosition(center, size, view, undefined).map((value) => Number(value.toFixed(3))), expected);
  assert.deepEqual(viewportCameraPosition(center, size, view, 'invalid').map((value) => Number(value.toFixed(3))), expected);
}

const directions = [
  { facing: 'x-min', front: [-33.2, 12, 8], side: [10, 12, 51.2], iso: [-21.2, 36, 39.2] },
  { facing: 'x-max', front: [53.2, 12, 8], side: [10, 12, -35.2], iso: [41.2, 36, -23.2] },
  { facing: 'z-min', front: [10, 12, -35.2], side: [-33.2, 12, 8], iso: [-21.2, 36, -23.2] },
  { facing: 'z-max', front: [10, 12, 51.2], side: [53.2, 12, 8], iso: [41.2, 36, 39.2] },
];

for (const { facing, front, side, iso } of directions) {
  assert.ok(isReferenceFacing(facing));
  assert.deepEqual(viewportCameraPosition(center, size, 'front', facing).map((value) => Number(value.toFixed(3))), front);
  assert.deepEqual(viewportCameraPosition(center, size, 'side', facing).map((value) => Number(value.toFixed(3))), side);
  assert.deepEqual(viewportCameraPosition(center, size, 'iso', facing).map((value) => Number(value.toFixed(3))), iso);
}

assert.equal(isReferenceFacing('invalid'), false);

const focus = viewportFocus([300, 60, 100], [
  { x: 120, y: 6, z: 20, blockId: 'minecraft:stone' },
  { x: 199, y: 25, z: 29, blockId: 'minecraft:stone' },
  { x: 299, y: 59, z: 99, blockId: 'minecraft:air' },
]);
assert.deepEqual(focus, { center: [160, 16, 25], size: 80, span: [80, 20, 10] });
assert.deepEqual(viewportFocus([20, 24, 16], []), { center, size, span: [20, 24, 16] });
const landscape = frameViewport(focus, 'front', 'z-min', 2);
const portrait = frameViewport(focus, 'front', 'z-min', 0.6);
assert.equal(landscape[0], 160);
assert.equal(landscape[1], 16);
assert.ok(portrait[2] < landscape[2], 'a portrait viewport backs up to keep a wide model in frame');

const model = { id: 'lantern', size: { x: 20, y: 24, z: 16 }, plan: { referenceFacing: 'z-min' } };
assert.equal(viewportCameraKey(model), viewportCameraKey({ ...model, blocks: [] }));
assert.notEqual(viewportCameraKey(model), viewportCameraKey({ ...model, id: 'next-lantern' }));
assert.notEqual(viewportCameraKey(model), viewportCameraKey({ ...model, plan: { referenceFacing: 'z-max' } }));
console.log('Viewport camera regression passed: presets, occupied bounds, portrait fit, and stable camera identity.');
