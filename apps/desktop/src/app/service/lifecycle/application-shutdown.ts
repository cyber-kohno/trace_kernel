namespace ApplicationShutdown {
  export type Phase =
    | 'idle'
    | 'confirming'
    | 'stopping'
    | 'closing'
    | 'failed'
    | 'closed';
  type Dependencies = {
    needsConfirmation(): boolean;
    confirmClose(): Promise<boolean>;
    shutdownNative(): Promise<unknown>;
    stopWorkers(): Promise<unknown>;
    stopMcp(): Promise<unknown>;
    closeWindow(): Promise<unknown>;
    onState?(phase: Phase, error: string): void;
  };

  export const create = (deps: Dependencies) => {
    let phase: Phase = 'idle';
    let stopping = false;
    let allowClose = false;
    let pending: Promise<void> | null = null;
    const setState = (next: Phase, error = '') => {
      phase = next;
      // A display observer cannot authorize closing or prevent cleanup.
      try {
        deps.onState?.(next, error);
      } catch {
        /* Keep the lifecycle authoritative. */
      }
    };
    const begin = (task: () => Promise<unknown>) => {
      try {
        return Promise.resolve(task());
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const close = async () => {
      try {
        if (!stopping && deps.needsConfirmation()) {
          setState('confirming');
          if (!(await deps.confirmClose())) {
            setState('idle');
            return;
          }
        }
        stopping = true; // Irreversible after approval; never reopen admission on failure.
        setState('stopping');
        // Start all participants before awaiting one; do not skip others on early failure.
        const results = await Promise.allSettled([
          begin(deps.shutdownNative),
          begin(deps.stopWorkers),
          begin(deps.stopMcp),
        ]);
        const names = ['Native I/O', 'Workers', 'MCP'];
        const failures = results.flatMap((result, index) =>
          result.status === 'rejected'
            ? [`${names[index]}: ${String(result.reason)}`]
            : [],
        );
        if (failures.length) throw new Error(failures.join('\n'));
        allowClose = true;
        setState('closing');
        await deps.closeWindow(); // Its reentrant close event may now pass.
        setState('closed');
      } catch (error) {
        allowClose = false;
        setState('failed', String(error));
      }
    };
    return {
      isStopping: () => stopping,
      canCloseWindow: () => allowClose,
      getPhase: () => phase,
      requestClose(): Promise<void> {
        if (phase === 'closed') return Promise.resolve();
        pending ??= close().finally(() => {
          pending = null;
        });
        return pending;
      },
    };
  };
}
export default ApplicationShutdown;
