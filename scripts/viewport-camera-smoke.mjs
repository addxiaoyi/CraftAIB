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
const { isReferenceFacing, viewportCameraPosition } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

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
console.log('Viewport camera regression passed: standard fallback, all four reference facings, and every preset.');
