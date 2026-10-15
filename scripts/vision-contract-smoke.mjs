import assert from 'node:assert/strict';
import { createLitematicaPlannerInstruction, planBuildingWithModel, structurePlanJsonSchema } from '../packages/ai-planner/dist/index.js';
assert.match(createLitematicaPlannerInstruction(), /multi-region/);
assert.equal(structurePlanJsonSchema().required.includes('regions'), true);
await assert.rejects(
  planBuildingWithModel({ prompt: 'tower' }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 0,
    maxRepairAttempts: 0,
    fetcher: async () => new Response('{not-json', { status: 200, headers: { 'content-type': 'application/json' } }),
  }),
  /invalid JSON/i,
);
await assert.rejects(
  planBuildingWithModel({ prompt: 'tower' }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 1,
    retryDelayMs: 0,
    fetcher: async () => { throw new Error('upstream timeout'); },
  }),
  /upstream timeout/i,
);
await assert.rejects(
  planBuildingWithModel({ prompt: 'tower' }, {
    endpoint: 'http://mock.invalid',
    maxRetries: 0,
    requestTimeoutMs: 1000,
    fetcher: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }),
  }),
  /timed out after 1000ms/i,
);
console.log('vision contract passed');
