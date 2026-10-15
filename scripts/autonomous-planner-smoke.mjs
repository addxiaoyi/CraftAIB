import assert from 'node:assert/strict';
import { planBuilding } from '../packages/ai-planner/dist/index.js';

const cases = [
  ['a dense futuristic city with towers', 'city'],
  ['a coastal harbor with docks and a lighthouse', 'harbor'],
  ['a grand palace with courtyards', 'palace'],
  ['a village around a central market', 'village'],
  ['an industrial factory with smokestacks', 'industrial'],
];
for (const [prompt, type] of cases) {
  const plan = planBuilding({ prompt, seed: 7 });
  assert.equal(plan.type, type, prompt);
  assert.equal(plan.inference?.source, 'prompt');
  assert.ok(plan.regions.length >= 2);
}
console.log('autonomous planner smoke passed');
