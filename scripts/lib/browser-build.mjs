import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function assertBrowserBuild(root) {
  const paths = ['dist/index.html', 'packages/engine-worker/dist/browser/browser-worker.js', 'frontend/public/engine-worker.js', 'dist/engine-worker.js'];
  const artifacts = await Promise.all(paths.map(async (path) => {
    try {
      return await readFile(resolve(root, path));
    } catch (error) {
      throw new Error(`Browser build artifact cannot be read: ${path}. Run npm run build:ui before browser verification.`, { cause: error });
    }
  }));
  const [, worker, staged, shipped] = artifacts;
  if (!worker.equals(staged) || !worker.equals(shipped)) {
    throw new Error('The browser build contains an outdated engine Worker. Run npm run build:ui before browser verification.');
  }
}
