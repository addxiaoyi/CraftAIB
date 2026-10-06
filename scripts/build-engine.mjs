import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const tsc = resolve(root, 'node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc');
const check = process.argv.includes('--check');
const packages = ['core', 'voxelartcraft-adapter', 'cartographer-adapter', 'craftmatic-adapter', 'engine-worker', 'engine-cli'];
for (const name of packages) {
  const result = spawnSync(process.execPath, [tsc, '-p', resolve(root, 'packages', name, 'tsconfig.json'), ...(check ? ['--noEmit'] : [])], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}


