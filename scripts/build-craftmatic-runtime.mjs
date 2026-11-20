import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve('vendor/craftmatic');
const entries = ['gen/generator.ts', 'render/three-scene.ts', 'schem/types.ts'];
for (const entry of entries) {
  if (!existsSync(resolve(root, 'src', entry))) {
    throw new Error(`Craftmatic runtime source is missing: ${entry}. Run git submodule update --init --recursive.`);
  }
}

// Build only the runtime imported by the adapters; the optional vendor CLI has separate dependencies.
await build({
  entryPoints: entries.map((entry) => resolve(root, 'src', entry)),
  outbase: resolve(root, 'src'), outdir: resolve(root, 'dist'),
  bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24',
});
console.log('Craftmatic adapter runtime built from source');
