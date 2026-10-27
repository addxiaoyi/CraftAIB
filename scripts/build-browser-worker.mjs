import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const outfile = resolve('packages/engine-worker/dist/browser/browser-worker.js');
await mkdir(dirname(outfile), { recursive: true });
await build({
  entryPoints: [resolve('packages/engine-worker/src/browser-worker.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile,
  alias: { '@craftaib/core': resolve('packages/core/src/index.ts') },
  external: ['node:*'],
});
console.log('browser worker bundled with the host-native esbuild binary');
