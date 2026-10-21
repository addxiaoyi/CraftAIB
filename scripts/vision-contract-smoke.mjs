import assert from 'node:assert/strict';
import { createLitematicaPlannerInstruction, planBuilding, planBuildingWithModel, structurePlanJsonSchema } from '../packages/ai-planner/dist/index.js';
assert.match(createLitematicaPlannerInstruction(), /multi-region/);
assert.equal(structurePlanJsonSchema().required.includes('regions'), true);
assert.equal(structurePlanJsonSchema().required.includes('inference'), true);
assertStrictObjects(structurePlanJsonSchema());
assert.match(createLitematicaPlannerInstruction(), /plain namespaced Minecraft block IDs only/);
const invalidPalettePlan = planBuilding({ prompt: 'gothic tower' });
invalidPalettePlan.palette.window = 'minecraft:glass_pane[east=true,north=true]';
const repairedPalettePlan = await planBuildingWithModel({ prompt: 'gothic tower' }, {
  endpoint: 'http://mock.invalid',
  maxRetries: 0,
  fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(invalidPalettePlan) } }] }), { status: 200 }),
});
assert.equal(repairedPalettePlan.palette.window, 'minecraft:glass_pane');
assert.match(repairedPalettePlan.notes.at(-1), /Auto-repaired vision response/);
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
  (error) => error?.code === 'MODEL_REQUEST_FAILED' && /could not connect/i.test(error.message),
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

function assertStrictObjects(schema) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, 'strict object schemas must reject additional properties');
    assert.deepEqual(new Set(schema.required), new Set(Object.keys(schema.properties ?? {})), 'every strict object property must be required');
  }
  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) value.forEach(assertStrictObjects);
    else if (value && typeof value === 'object') assertStrictObjects(value);
  }
}
