import { createCoreRunner } from './runner.js';
import { createTaskRegistry } from './index.js';

const registry = createTaskRegistry((event) => self.postMessage(event), createCoreRunner());
self.onmessage = (event) => {
  const message = event.data;
  if (message?.type === 'cancel') { registry.cancel(message.taskId); return; }
  registry.run(message);
};
