import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = (relative) => path.join(root, relative);
await build({
  entryPoints: [file('packages/engine-worker/src/browser-worker.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outfile: file('packages/engine-worker/dist/browser/browser-worker.js'),
  alias: { '@craftaib/core': file('packages/core/src/index.ts') },
  external: ['node:*'],
});
console.log('browser worker bundled');
