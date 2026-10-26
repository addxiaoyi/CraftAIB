import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const root = process.cwd();
const tscCandidates = [
  resolve(root, 'node_modules/typescript/bin/tsc'),
  resolve(root, 'node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc'),
];
const tsc = tscCandidates.find((candidate) => existsSync(candidate));
if (!tsc) throw new Error('TypeScript compiler was not found. Run npm install or pnpm install.');
const check = process.argv.includes('--check');
const packages = ['core', 'ai-planner', 'voxelartcraft-adapter', 'cartographer-adapter', 'waxmapart-adapter', 'craftmatic-adapter', 'engine-worker', 'engine-cli'];
const runTsc = (project, noEmit = false) => {
  const args = [tsc, '-p', project];
  if (noEmit) args.push('--noEmit');
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// Craftmatic's optional CLI/rendering sources require its own vendor dependency install.
// The shared adapter/runtime build must remain usable from the root npm install.
if (process.env.CRAFTAIB_BUILD_VENDOR === '1') runTsc(resolve(root, 'vendor', 'craftmatic', 'tsconfig.json'));
if (check) {
  // TypeScript package boundaries consume generated declaration files from the previous package.
  // Emit once to make --check reproducible from a fresh checkout, then run the actual checks.
  for (const name of packages) runTsc(resolve(root, 'packages', name, 'tsconfig.json'));
}
for (const name of packages) runTsc(resolve(root, 'packages', name, 'tsconfig.json'), check);
