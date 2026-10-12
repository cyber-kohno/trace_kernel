type FlushDeps = {
  getBatches(channelId: string): string[][];
  appendToRuntime(channelId: string, batches: string[][]): Promise<void>;
  notifyUI(channelId: string): void;
  hasAnyPending(): boolean;
  getActiveChannelIds(): string[];
};

export type FlushScheduler = {
  schedule(channelId: string): void;
  finish(): Promise<void>;
  dispose(): void;
};

export function createFlushScheduler(deps: FlushDeps): FlushScheduler {
  let accepting = true;
  let disposed = false;
  let failed = false;
  let failure: unknown;
  let pending: Promise<void> | null = null;

  const pump = (): Promise<void> => {
    if (pending) return pending;
    // Background failures are retained for finish(), never retried implicitly.
    pending = Promise.resolve().then(async () => {
      try {
        while (!disposed && !failed && deps.hasAnyPending()) {
          for (const channelId of deps.getActiveChannelIds()) {
            if (disposed) break;
            const batches = deps.getBatches(channelId);
            if (batches.length === 0) continue;
            await deps.appendToRuntime(channelId, batches);
            if (!disposed) deps.notifyUI(channelId);
          }
        }
      } catch (err) {
        failed = true;
        failure = err;
      } finally {
        pending = null;
      }
    });
    return pending;
  };

  return {
    schedule() {
      if (!accepting || disposed) throw new Error('Output is closed.');
      if (failed) throw failure;
      void pump();
    },
    async finish() {
      accepting = false;
      await pump();
      if (disposed) throw new Error('Output was disposed.');
      if (failed) throw failure;
    },
    dispose() {
      accepting = false;
      disposed = true;
    },
  };
}
