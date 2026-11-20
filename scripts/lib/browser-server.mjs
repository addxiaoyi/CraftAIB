import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { assertBrowserBuild } from './browser-build.mjs';

export async function withBrowserServer(run) {
  const root = resolve('.');
  await assertBrowserBuild(root);
  const temp = await mkdtemp(join(tmpdir(), 'craftaib-browser-'));
  const env = { ...process.env, PORT: '0', CRAFTAIB_PUBLIC_DIR: resolve('dist') };
  for (const key of Object.keys(env)) if (/^CRAFTAIB_(MODEL|TEXT|VISION|OIDC|ADMIN|ALLOWED)/.test(key)) env[key] = '';
  const server = spawn(process.execPath, [resolve('scripts/server.mjs')], { cwd: temp, env, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const base = await new Promise((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error('Browser fixture server did not start in 15 seconds.')), 15000);
      server.stdout.on('data', (chunk) => {
        const url = /http:\/\/127\.0\.0\.1:\d+/.exec(chunk.toString())?.[0];
        if (url) { clearTimeout(timer); resolveReady(url); }
      });
      server.once('error', (error) => { clearTimeout(timer); reject(error); });
      server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Fixture server exited (${code}).`)); });
    });
    return await run(base, env);
  } finally {
    if (server.exitCode === null && server.signalCode === null && server.pid) {
      const stopped = new Promise((done) => server.once('exit', done));
      server.kill();
      await stopped;
    }
    await rm(temp, { recursive: true, force: true });
  }
}
