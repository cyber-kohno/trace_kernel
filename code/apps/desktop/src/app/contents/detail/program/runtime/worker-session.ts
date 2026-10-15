import type { MessageProps } from './worker';
import type WorkerProtocol from './worker-protocol';
import NativeIoPolicy from './native-io-policy';

namespace WorkerSession {
  export interface WorkerPort {
    setHandlers(
      handlers: {
        message(data: WorkerProtocol.Event): void;
        error(message: string): void;
        messageError(): void;
      } | null,
    ): void;
    postMessage(value: unknown): void;
    terminate(): void;
  }

  type Dependencies = {
    createWorker(): WorkerPort;
    createId(): string;
    invoke(command: string, args: any): Promise<unknown>;
    onEvent(event: WorkerProtocol.Event): void | Promise<void>;
    onObserverError(error: unknown): void;
  };

  type Execution = {
    worker: WorkerPort;
    id: string;
    started: boolean;
    terminal: boolean;
    stopped: boolean;
    sourceMap: string;
    events: Promise<void>;
    initializations: Set<Promise<unknown>>;
    ownedRequests: Set<Promise<unknown>>;
    stop?: Promise<unknown>;
  };

  export const create = (deps: Dependencies) => {
    let current: Execution | null = null;
    let disposed = false;
    let lastCleanup: Promise<void> = Promise.resolve();
    const active = (run: Execution) => current === run && !run.stopped;
    const stopOwned = (run: Execution) => {
      run.stop ??= (async () => {
        await Promise.allSettled([...run.initializations]);
        return deps.invoke('worker_stop', { executionId: run.id });
      })();
      // Stop starts immediately, even while a display callback is awaiting output.
      void run.stop.catch(() => {});
      return run.stop;
    };

    const fail = async (run: Execution, error: unknown) => {
      if (!active(run)) return;
      run.terminal = true;
      run.worker.terminate();
      // Suppress queued callbacks, but keep native output until cleanup.
      run.stopped = true;
      let stack =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      let cleanupFailed = false;
      try {
        await stopOwned(run);
      } catch (cleanupError) {
        cleanupFailed = true;
        stack = `${stack.split('\n')[0]} (Native cleanup failed: ${String(cleanupError)})\n${stack}`;
      }
      if (current !== run || disposed) return;
      try {
        await deps.onEvent({
          type: 'runtime-error',
          stack,
          sourceMap: run.sourceMap,
          cleanupFailed,
        });
      } catch (err) {
        deps.onObserverError(err);
      }
    };

    const invoke = async (
      run: Execution,
      event: WorkerProtocol.InvokeEvent,
    ) => {
      try {
        const owned = NativeIoPolicy.isOwnedCommand(event.command);
        const request = deps.invoke(
          event.command,
          owned ? { ...event.args, executionId: run.id } : event.args,
        );
        if (owned) run.ownedRequests.add(request);
        // A late worker_init must finish before worker_dispose, or it recreates state.
        if (event.command === 'worker_init') run.initializations.add(request);
        let result: unknown;
        try {
          result = await request;
        } finally {
          run.initializations.delete(request);
          run.ownedRequests.delete(request);
        }
        if (active(run) && !run.terminal) {
          run.worker.postMessage({
            type: 'invoke-result',
            id: event.id,
            result,
          });
        }
      } catch (err) {
        if (!active(run) || run.terminal) return;
        const lines = (event.callsiteStack ?? '').split('\n');
        lines[0] = String(err);
        try {
          run.worker.postMessage({
            type: 'invoke-error',
            id: event.id,
            callsiteStack: lines.join('\n'),
          });
        } catch (error) {
          await fail(run, error);
        }
      }
    };

    const terminate = () => {
      const run = current;
      if (!run) return lastCleanup;
      current = null;
      run.stopped = true;
      run.worker.setHandlers(null);
      run.worker.terminate();
      lastCleanup = (async () => {
        await Promise.allSettled([...run.initializations]);
        await deps.invoke('worker_dispose', { executionId: run.id });
      })();
      return lastCleanup;
    };

    return {
      init() {
        if (disposed) throw new Error('Worker session is disposed.');
        if (current) throw new Error('Worker is already initialized.');
        const run: Execution = {
          worker: deps.createWorker(),
          id: deps.createId(),
          started: false,
          terminal: false,
          stopped: false,
          sourceMap: '',
          events: Promise.resolve(),
          initializations: new Set(),
          ownedRequests: new Set(),
        };
        current = run;
        const fatal = (error: Error) => {
          if (!active(run) || run.terminal) return;
          run.terminal = true;
          run.worker.terminate();
          stopOwned(run);
          run.events = run.events
            .then(() => fail(run, error))
            .catch(deps.onObserverError);
        };
        run.worker.setHandlers({
          message: (data) => {
            if (!active(run) || run.terminal) return;
            if (data.type === 'invoke') {
              void invoke(run, data);
              return;
            }
            const terminal =
              data.type === 'done' || data.type === 'runtime-error';
            const unfinished =
              data.type === 'done' && run.ownedRequests.size > 0;
            if (terminal) {
              run.terminal = true;
              // User timers cannot produce more worker effects after completion.
              run.worker.terminate();
              stopOwned(run);
            }
            run.events = run.events
              .then(async () => {
                if (!active(run)) return;
                if (terminal) await stopOwned(run);
                if (unfinished)
                  throw new Error('Work completed with unfinished native I/O.');
                if (active(run)) await deps.onEvent(data);
              })
              .catch((err) => fail(run, err));
          },
          error: (message) => fatal(new Error(message)),
          messageError: () =>
            fatal(new Error('Worker message could not be decoded.')),
        });
      },
      start(props: Omit<MessageProps, 'executionId'>) {
        if (!current || current.started || current.stopped)
          throw new Error('Worker cannot start.');
        current.started = true;
        current.sourceMap = props.sourceMapText;
        current.worker.postMessage({ ...props, executionId: current.id });
      },
      getExecutionId: () => current?.id ?? '',
      terminate,
      dispose() {
        disposed = true;
        return terminate();
      },
    };
  };
}
export default WorkerSession;
