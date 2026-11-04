import assert from 'node:assert/strict';
import { builderFromReply } from '../packages/ai-planner/dist/builder/index.js';
import { evaluateBuilderScript } from './lib/builder-sandbox.mjs';

const build = (code, options = {}) => builderFromReply(`<code>function buildCreation() { ${code} }</code>`, {
  maxBlocks: 100, evaluate: (source, helpers) => evaluateBuilderScript(source, helpers, options),
});
const valid = build('safeFill(0, 0, 0, 2, 0, 2, "stone"); safeSetBlock(1, 1, 1, "blackstone_stairs[facing=north,half=bottom]");');
assert.equal(valid.ok, true, valid.error);
assert.equal(valid.grid.cells.length, 10);
assert.equal(valid.grid.cells.at(-1).block.properties.facing, 'north');

const isolated = build(`
  const realm = safeSetBlock.constructor('return globalThis')();
  for (const name of ['process', 'require', 'fetch', 'WebSocket', 'XMLHttpRequest']) {
    if (realm[name] !== undefined) throw new Error('Host capability exposed: ' + name);
  }
  realm.__craftaibSandboxProbe = 'guest';
  safeSetBlock(0, 0, 0, 'stone');
`);
assert.equal(isolated.ok, true, isolated.error);
assert.equal(globalThis.__craftaibSandboxProbe, undefined);

const started = Date.now();
const loop = build('while (true) {}', { timeoutMs: 30 });
assert.equal(loop.ok, false);
assert.match(loop.error, /interrupted|deadline/);
assert.ok(Date.now() - started < 1500, 'infinite loops must return control to the server');

const memory = build('const retained = []; for (let i = 0; i < 1000000; i++) retained.push({ i });', { timeoutMs: 1500, memoryBytes: 1024 * 1024 });
assert.equal(memory.ok, false);
assert.match(memory.error, /out of memory/);
const exceeded = build('try { safeFill(0, 0, 0, 10, 0, 10, "stone"); } catch {}');
assert.equal(exceeded.ok, false, 'a script cannot swallow the host block budget failure');
assert.match(exceeded.error, /budget/);
assert.equal(build('safeSetBlock(0, 0, 0, "stone");').ok, true, 'each request gets a fresh runtime');
console.log('Builder sandbox passed: real build, host isolation, execution deadline, memory cap, block budget and recovery.');
