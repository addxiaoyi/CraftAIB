import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'vite';

// The UI loads frontend/public/engine-worker.js, which is a staged copy of the
// bundled worker. Rebuild and stage it so dev never runs an older worker that
// silently drops newer task inputs such as the BuilderGPT mode flag.
for (const script of ['scripts/build-engine.mjs', 'scripts/build-browser-worker.mjs', 'scripts/stage-browser-worker.mjs']) {
  execFileSync(process.execPath, [script], { stdio: 'inherit' });
}

const apiPort = Number(process.env.CRAFTAIB_API_PORT || 4184);
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('CRAFTAIB_API_PORT must be an integer between 1 and 65535.');
const api = spawn(process.execPath, ['scripts/server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(apiPort), CRAFTAIB_PUBLIC_DIR: 'dist' },
  stdio: 'inherit',
  windowsHide: true,
});
let server;
let stopping;

const stop = (code = 0) => {
  if (stopping) return stopping;
  process.exitCode = code;
  stopping = (async () => {
    await server?.close();
    if (api.exitCode === null && !api.killed) api.kill();
  })();
  return stopping;
};

process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
api.once('error', (error) => {
  console.error(`CraftAIB API could not start: ${error.message}`);
  void stop(1);
});
api.once('exit', (code, signal) => {
  if (stopping) return;
  console.error(`CraftAIB API stopped (exit ${code ?? signal ?? 'unknown'}).`);
  void stop(code || 1);
});

try {
  server = await createServer({ configFile: 'vite.config.ts' });
  if (stopping) {
    await server.close();
    await stopping;
  } else {
    await server.listen();
    if (stopping) await server.close();
    else server.printUrls();
  }
} catch (error) {
  await stop(1);
  throw error;
}
