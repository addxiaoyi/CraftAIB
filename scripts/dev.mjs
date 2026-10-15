import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'vite';

const apiPort = Number(process.env.CRAFTAIB_API_PORT || 4184);
const api = spawn(process.execPath, ['scripts/server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(apiPort), CRAFTAIB_PUBLIC_DIR: 'dist' },
  stdio: 'inherit',
});
const server = await createServer({ configFile: 'vite.config.ts' });

const stop = async () => {
  await server.close();
  api.kill();
};

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
api.once('exit', (code) => {
  if (code !== null && code !== 0) void stop();
});

await server.listen();
server.printUrls();
await once(process, 'beforeExit');
