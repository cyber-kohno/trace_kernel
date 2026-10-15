import type DatasetState from '../../../../state/model/workspace/dataset-state';
import type WorkState from '../../../../state/model/workspace/work-state';
import { runPreparedWork } from '../../../../service/execution/run-work';
import post from './worker-post';
import DeclareUtil from '../util/declare-util';
import ContextDataUtil from '../util/context-data-util';
import DclRuntime from '../util/dcl-runtime';
import WorkerInvoke from '../util/worker-invoke';
import RuntimeUtil from './runtime-util';
import { createFlushScheduler } from './stream-flush';

export interface MessageProps {
  type: 'execute';
  executionId: string;
  outputText: string;
  sourceMapText: string;
  contextData: ContextDataUtil.Props;
  usableUtils: DeclareUtil.ReserveDef[];
  outputMethod: WorkState.OutputMethod;
}

export interface StateMessage {
  type: 'state';
  method: 'createProgress' | 'createMonitor' | 'tick' | 'setMonitor';
  props: any;
}

const scheduler = createFlushScheduler({
  getBatches(channelId) {
    const queue = cache.rust.logQueues.get(channelId);
    if (!queue || queue.length === 0) return [];
    return queue.splice(0, queue.length);
  },

  async appendToRuntime(channelId, batches) {
    await cache.rust.channelReady?.get(channelId);
    await WorkerInvoke.call('append_lines', {
      executionId: cache.rust.executionId,
      channelId,
      batches,
    });
  },

  notifyUI(channelId) {
    post({ type: 'receive_stream', channelId });
  },
  getActiveChannelIds() {
    return Array.from(cache.rust.logQueues.keys());
  },
  hasAnyPending(): boolean {
    for (const batches of cache.rust.logQueues.values()) {
      if (batches.length > 0) {
        return true;
      }
    }
    return false;
  },
});

function scheduleFlush(channelId: string) {
  scheduler.schedule(channelId);
}

/**
 * WorkerのRuntimeで使用するキャッシュ情報
 */
const cache: RuntimeUtil.WorkerCache = {
  progress: { current: 0, total: 0 },
  preparation: { datasetMap: [] },
  vfs: null,
  rust: {
    executionId: '',
    logQueues: new Map<string, string[][]>(),
  },
  scheduleFlush,
  createVFS: () => {
    const txCache = RuntimeUtil.getInitialVfsState();
    cache.vfs = txCache;
    return txCache;
  },
};

let started = false;
self.onmessage = async (e: MessageEvent<MessageProps>) => {
  const { type, sourceMapText, executionId } = e.data;
  if (type === 'execute') {
    if (started) return;
    started = true;
    cache.rust.executionId = executionId;
    self.fetch = undefined as any;
    const outcome = await runPreparedWork(e.data, {
      initialize: () => WorkerInvoke.call('worker_init', { executionId }),
      createReservedApi: (name) => DeclareUtil.createUtilObject(name, cache),
      scanDirectory: (req) =>
        WorkerInvoke.call<DatasetState.ScanResponse>('scan_directory', { req }),
      onPrepared: (datasets) => {
        cache.preparation.datasetMap = datasets;
        post({ type: 'prepared' });
      },
      prepareOutput: async (method) => {
        if (method === 'plain') {
          post({
            type: 'create_stream',
            props: {
              id: RuntimeUtil.PLAIN_CHANNEL_ID,
              view: 'text',
              detail: {},
            },
          });
          await WorkerInvoke.call('add_channel', {
            executionId,
            channelId: RuntimeUtil.PLAIN_CHANNEL_ID,
          });
        }
      },
      createContext: (data) =>
        ContextDataUtil.createObjects(data, cache.preparation, cache.rust),
      isExitSignal: DclRuntime.isExitSignal,
      // Registration is also observed for empty channels. Flush emitted lines on errors too.
      waitForRegistrations: () =>
        Promise.all(cache.rust.channelReady?.values() ?? []),
      flushOutput: () => scheduler.finish(),
    });
    if (outcome.status === 'failed') {
      post({
        type: 'runtime-error',
        stack:
          outcome.error instanceof Error
            ? (outcome.error.stack ?? outcome.error.message)
            : String(outcome.error),
        sourceMap: sourceMapText,
      });
    } else {
      post({ type: 'done', vfs: cache.vfs });
    }
  }
};
