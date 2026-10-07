import assert from 'node:assert/strict';
import { createTaskRegistry } from '../packages/engine-worker/dist/index.js';

const events = [];
const registry = createTaskRegistry((event) => events.push(event), async (task, emit, signal) => {
  emit({ type: 'progress', taskId: task.id, value: 0.5, stage: 'working' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  if (signal.aborted) throw new Error('cancelled');
  return { task: task.type };
});
await registry.run({ id: 'smoke', type: 'test', input: null });
assert.equal(events.at(-1).type, 'result');
assert.equal(registry.cancel('missing'), false);
console.log('worker task registry tests passed');
