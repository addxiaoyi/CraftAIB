import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve('packages/engine-worker/dist/browser/browser-worker.js');
const target = resolve('frontend/public/engine-worker.js');
await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log('Browser engine worker staged for the React frontend.');
