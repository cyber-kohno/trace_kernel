export type WorkBinding = { name: string; value: unknown };

export const executeCompiledWork = async (
  outputText: string,
  bindings: readonly WorkBinding[],
  isExitSignal: (error: unknown) => boolean,
): Promise<void> => {
  const wrappedCode = `return (async () => {${outputText}\n})()`;
  const func = new Function(
    ...bindings.map((binding) => binding.name),
    wrappedCode,
  );
  try {
    await func(...bindings.map((binding) => binding.value));
  } catch (error) {
    if (!isExitSignal(error)) throw error;
  }
};

export type WorkLifecycleStages = {
  execute: () => Promise<unknown> | unknown;
  waitForRegistrations: () => Promise<unknown> | unknown;
  flushOutput: () => Promise<unknown> | unknown;
};

export type WorkOutcome =
  | { status: "done" }
  | { status: "failed"; error: unknown };

export const runWorkLifecycle = async ({
  execute,
  waitForRegistrations,
  flushOutput,
}: WorkLifecycleStages): Promise<WorkOutcome> => {
  let failed = false;
  let firstError: unknown;
  for (const stage of [execute, waitForRegistrations, flushOutput]) {
    try {
      await stage();
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
  }
  return failed ? { status: "failed", error: firstError } : { status: "done" };
};
