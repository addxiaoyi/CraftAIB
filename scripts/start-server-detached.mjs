import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const timeoutMs = Number(process.env.CRAFTAIB_START_TIMEOUT_MS || 15000);
if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
  throw new Error('CRAFTAIB_START_TIMEOUT_MS must be an integer between 100 and 120000.');
}

const logDir = resolve('outputs/server');
await mkdir(logDir, { recursive: true });
const logPath = resolve(logDir, `${Date.now()}-${randomUUID()}.log`);
const log = await open(logPath, 'wx');
let child;
let startError;
try {
  child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log.fd, log.fd],
  });
  child.once('error', (error) => { startError = error; });
} finally {
  await log.close();
}

const deadline = Date.now() + timeoutMs;
try {
  let url;
  while (Date.now() < deadline) {
    if (startError) throw startError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Server exited before becoming ready (${child.exitCode ?? child.signalCode}).`);
    }
    const output = await readFile(logPath, 'utf8');
    url = /CraftAIB listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(output)?.[1];
    if (url) {
      const response = await fetch(`${url}/api/ai/status`, { signal: AbortSignal.timeout(Math.min(2000, Math.max(1, deadline - Date.now()))) });
      if (!response.ok || !(await response.json()).ok) throw new Error(`Server readiness check failed (${response.status}).`);
      for (const [path, contentType] of [['/', 'text/html'], ['/engine-worker.js', 'text/javascript']]) {
        const asset = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(2000) });
        await asset.arrayBuffer();
        if (!asset.ok || !asset.headers.get('content-type')?.includes(contentType)) {
          throw new Error(`Frontend asset ${path} is unavailable. Run npm run build:ui before starting the server.`);
        }
      }
      break;
    }
    await delay(100);
  }
  if (!url) throw new Error(`Server did not become ready within ${timeoutMs}ms.`);
  child.unref();
  console.log(`CraftAIB detached server ready at ${url} (pid ${child.pid}). Log: ${logPath}`);
} catch (error) {
  if (child.exitCode === null && child.signalCode === null && !startError) child.kill();
  throw new Error(`CraftAIB detached startup failed: ${error.message} Log: ${logPath}`, { cause: error });
}
