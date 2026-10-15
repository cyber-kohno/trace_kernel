import { invoke } from '@tauri-apps/api/core';
import WorkerSession from '../runtime/worker-session';
import type WorkerProtocol from '../runtime/worker-protocol';
import { applicationWorkers } from '../../../../service/lifecycle/worker-lifecycle';

namespace WorkerAdapter {
  export type WorkerEvent = WorkerProtocol.Event;

  export const use = (
    onEvent: (event: WorkerEvent) => void | Promise<void>,
  ) => {
    const session = WorkerSession.create({
      createWorker: () => {
        const worker = new Worker(
          new URL('../runtime/worker.ts', import.meta.url),
          {
            type: 'module',
          },
        );
        return {
          setHandlers(handlers) {
            worker.onmessage = handlers
              ? (event) => handlers.message(event.data)
              : null;
            worker.onerror = handlers
              ? (event) => {
                  event.preventDefault();
                  handlers.error(event.message);
                }
              : null;
            worker.onmessageerror = handlers
              ? () => handlers.messageError()
              : null;
          },
          postMessage: (value) => worker.postMessage(value),
          terminate: () => worker.terminate(),
        };
      },
      createId: () => crypto.randomUUID(),
      invoke,
      onEvent,
      onObserverError: (error) =>
        console.error('Worker event handler failed', error),
    });
    const dispose = () => {
      const result = session.dispose();
      void result.then(unregister, () => {}); // Keep a failed cleanup registered.
      return result;
    };
    const unregister = applicationWorkers.register(dispose);
    return {
      ...session,
      init() {
        applicationWorkers.assertOpen();
        session.init();
      },
      start(props: Parameters<typeof session.start>[0]) {
        applicationWorkers.assertOpen();
        session.start(props);
      },
      dispose,
    };
  };
}
export default WorkerAdapter;
