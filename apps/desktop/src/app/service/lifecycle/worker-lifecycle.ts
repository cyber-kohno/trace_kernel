namespace WorkerLifecycle {
  export const create = () => {
    const stops = new Set<() => Promise<void>>();
    let closing = false;
    let pending: Promise<void> | null = null;
    const assertOpen = () => {
      if (closing) throw new Error('Application is shutting down.');
    };
    return {
      assertOpen,
      register(stop: () => Promise<void>) {
        assertOpen();
        stops.add(stop);
        return () => {
          stops.delete(stop);
        };
      },
      stopAll(): Promise<void> {
        closing = true;
        pending ??= (async () => {
          const results = await Promise.allSettled(
            [...stops].map((stop) => {
              try {
                return Promise.resolve(stop());
              } catch (error) {
                return Promise.reject(error);
              }
            }),
          );
          const failures = results.flatMap((result) =>
            result.status === 'rejected' ? [String(result.reason)] : [],
          );
          if (failures.length) throw new Error(failures.join('; '));
        })();
        return pending;
      },
    };
  };
}
export const applicationWorkers = WorkerLifecycle.create();
export default WorkerLifecycle;
