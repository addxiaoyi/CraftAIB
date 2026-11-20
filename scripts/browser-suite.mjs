import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { withBrowserServer } from './lib/browser-server.mjs';

const root = resolve('.');
await withBrowserServer(async (base, env) => {
  const tests = ['architect-ui-smoke.mjs', 'ai-generation-browser-smoke.mjs', 'ui-button-smoke.mjs', 'ui-file-action-smoke.mjs', 'export-edit-browser-smoke.mjs', 'project-state-browser-smoke.mjs', 'viewer-region-browser-smoke.mjs', 'resource-pack-browser-smoke.mjs', 'responsive-browser-smoke.mjs', 'viewer-performance-smoke.mjs', 'renderer-loading-smoke.mjs'];
  for (const test of tests) {
    console.log(`Browser suite: ${test}`);
    await new Promise((resolveTest, reject) => {
      const child = spawn(process.execPath, [join(root, 'scripts', test)], { cwd: root, env: { ...env, CRAFTAIB_PREVIEW_URL: base, CRAFTAIB_ARCHITECT_URL: base }, stdio: 'inherit' });
      const timer = setTimeout(() => { child.kill(); reject(new Error(`${test} exceeded its 180 second budget.`)); }, 180000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolveTest() : reject(new Error(`${test} failed (${code}).`)); });
    });
  }
  console.log(`Browser suite passed: ${tests.length} fixture suites; no live model requests.`);
});
