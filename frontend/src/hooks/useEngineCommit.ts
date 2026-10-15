import { useCallback, useRef, useState } from 'react';

export function useEngineCommit() {
  const controllerRef = useRef<AbortController | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  const run = useCallback(async <T,>(task: (signal: AbortSignal, report: (stage: string) => void) => Promise<T>) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsRunning(true);
    setError(null);
    setProgress('Starting...');
    try {
      return await task(controller.signal, setProgress);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        setError('Task cancelled.');
      } else {
        setError(reason instanceof Error ? reason.message : 'Engine task failed.');
      }
      return undefined;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setIsRunning(false);
    }
  }, []);

  return { isRunning, progress, error, run, cancel };
}
