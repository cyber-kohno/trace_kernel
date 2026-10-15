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
    confirmRestart?(): Promise<boolean>;
    restartApp?(): Promise<unknown>;
    onState?(phase: Phase, error: string): void;
  };

  export const create = (deps: Dependencies) => {
    let phase: Phase = 'idle';
    let stopping = false;
    let allowClose = false;
    let pending: Promise<void> | null = null;
    let action: 'close' | 'restart' = 'close';
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
    const finish = async () => {
      try {
        if (!stopping && deps.needsConfirmation()) {
          setState('confirming');
          const confirm =
            action === 'restart'
              ? (deps.confirmRestart ?? deps.confirmClose)
              : deps.confirmClose;
          if (!(await confirm())) {
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
        if (action === 'restart') {
          if (!deps.restartApp) throw new Error('Restart is unavailable.');
          await deps.restartApp();
        } else {
          await deps.closeWindow(); // Its reentrant close event may now pass.
        }
        setState('closed');
      } catch (error) {
        allowClose = false;
        setState('failed', String(error));
      }
    };
    const request = (nextAction: 'close' | 'restart'): Promise<void> => {
      if (pending) return pending;
      if (phase === 'closed') return Promise.resolve();
      action = nextAction;
      pending = finish().finally(() => {
        pending = null;
      });
      return pending;
    };
    return {
      isStopping: () => stopping,
      canCloseWindow: () => allowClose,
      getPhase: () => phase,
      getAction: () => action,
      requestClose: () => request('close'),
      requestRestart: () => request('restart'),
      retry: () => request(action),
    };
  };
}
export default ApplicationShutdown;
