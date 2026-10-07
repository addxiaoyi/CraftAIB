import { createCoreRunner } from './runner.js';
import { createWorkerRunner } from './index.js';
self.onmessage = createWorkerRunner(createCoreRunner());
