import type { EngineEvent, EngineTask } from '@craftaib/core';

export type TaskRunner = (task: EngineTask, emit: (event: EngineEvent) => void, signal: AbortSignal) => Promise<unknown>;

export function createWorkerRunner(runner: TaskRunner): (event: MessageEvent<EngineTask>) => Promise<void> {
  return async (event) => {
    const task = event.data;
    const controller = new AbortController();
    const emit = (message: EngineEvent) => self.postMessage(message);
    try {
      const output = await runner(task, emit, controller.signal);
      emit({ type: 'result', taskId: task.id, output });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Engine task failed.';
      emit({ type: 'error', taskId: task.id, code: 'TASK_FAILED', message });
    }
  };
}
