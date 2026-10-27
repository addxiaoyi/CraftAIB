import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const child = spawn(process.execPath, [resolve('scripts/server.mjs')], {
  cwd: process.cwd(),
  env: process.env,
  detached: true,
  windowsHide: true,
  stdio: 'ignore',
});

child.unref();
console.log(`CraftAIB detached server started (pid ${child.pid ?? 'unknown'}).`);
