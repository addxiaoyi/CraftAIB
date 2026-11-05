import { getQuickJS } from 'quickjs-emscripten';

const QuickJS = await getQuickJS();
const MEMORY_LIMIT = 64 * 1024 * 1024;
const MAX_SCRIPT_LENGTH = 250_000;

export function evaluateBuilderScript(source, helpers, { timeoutMs = 2000, memoryBytes = MEMORY_LIMIT } = {}) {
  if (source.length > MAX_SCRIPT_LENGTH) throw new Error('The build script exceeds the 250,000 character limit.');
  const vm = QuickJS.newContext();
  vm.runtime.setMemoryLimit(memoryBytes);
  vm.runtime.setMaxStackSize(256 * 1024);
  const deadline = Date.now() + timeoutMs;
  vm.runtime.setInterruptHandler(() => Date.now() >= deadline);
  let hostFailure;
  try {
    for (const [name, helper] of Object.entries(helpers)) {
      const handle = vm.newFunction(name, (...args) => {
        if (hostFailure) throw hostFailure;
        try {
          if (Date.now() >= deadline) throw new Error('The build script exceeded its execution deadline.');
          helper(...args.map((value) => vm.dump(value)));
        } catch (error) {
          hostFailure = error instanceof Error ? error : new Error(String(error));
          throw hostFailure;
        }
      });
      vm.setProp(vm.global, name, handle);
      handle.dispose();
    }
    // Only primitive values and copied arguments cross the WASM boundary, never host objects.
    const execution = vm.evalCode(`(function () {\n${source}\n})()`, 'builder-script.js');
    if (execution.error) {
      const failure = vm.dump(execution.error);
      execution.error.dispose();
      throw new Error(`Build script: ${failure?.message ?? String(failure)}`);
    }
    execution.value.dispose();
    if (hostFailure) throw hostFailure;
  } finally {
    vm.dispose();
  }
}
