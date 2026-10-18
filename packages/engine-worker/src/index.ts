import type { EngineEvent, EngineTask } from '@craftaib/core';

export type TaskRunner = (task: EngineTask, emit: (event: EngineEvent) => void, signal: AbortSignal) => Promise<unknown>;
export type TaskRegistry = { run(task: EngineTask): Promise<void>; cancel(taskId: string): boolean };

export function createTaskRegistry(post: (event: EngineEvent) => void, runner: TaskRunner): TaskRegistry {
  const controllers = new Map<string, AbortController>();
  return {
    async run(task) {
      if (controllers.has(task.id)) { post({ type: 'error', taskId: task.id, code: 'DUPLICATE_TASK', message: `Task '${task.id}' is already running.` }); return; }
      const controller = new AbortController(); controllers.set(task.id, controller);
      try {
        const output = await runner(task, post, controller.signal);
        post(controller.signal.aborted ? { type: 'cancelled', taskId: task.id } : { type: 'result', taskId: task.id, output });
      } catch (error) {
        const failure = error as Error & { code?: string };
        post(controller.signal.aborted ? { type: 'cancelled', taskId: task.id } : { type: 'error', taskId: task.id, code: failure.code ?? 'TASK_FAILED', message: failure.message || 'Engine task failed.' });
      } finally { controllers.delete(task.id); }
    },
    cancel(taskId) { const controller = controllers.get(taskId); if (!controller) return false; controller.abort(); return true; },
  };
}

export function createWorkerRunner(runner: TaskRunner): (event: MessageEvent<EngineTask>) => Promise<void> {
  const registry = createTaskRegistry((message) => self.postMessage(message), runner);
  return (event) => registry.run(event.data);
}
export { createCoreRunner } from './runner.js';
