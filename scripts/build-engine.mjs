import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const tsc = resolve(root, 'node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc');
const check = process.argv.includes('--check');
const packages = ['core', 'ai-planner', 'voxelartcraft-adapter', 'cartographer-adapter', 'craftmatic-adapter', 'engine-worker', 'engine-cli'];
const runTsc = (project, noEmit = false) => {
  const args = [tsc, '-p', project];
  if (noEmit) args.push('--noEmit');
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// Craftmatic is a pinned submodule, but its generated runtime is intentionally not committed.
runTsc(resolve(root, 'vendor', 'craftmatic', 'tsconfig.json'));
if (check) {
  // TypeScript package boundaries consume generated declaration files from the previous package.
  // Emit once to make --check reproducible from a fresh checkout, then run the actual checks.
  for (const name of packages) runTsc(resolve(root, 'packages', name, 'tsconfig.json'));
}
for (const name of packages) runTsc(resolve(root, 'packages', name, 'tsconfig.json'), check);
