import type DatasetState from '../../../../state/model/workspace/dataset-state';
import type WorkState from '../../../../state/model/workspace/work-state';
import type TauriDto from '../../../../infra/tauri/tauri-dto';
import DataUtil from '../../../../util/data/data-util';
import post from './worker-post';
import DeclareUtil from '../util/declare-util';
import ContextDataUtil from '../util/context-data-util';
import DclRuntime from '../util/dcl-runtime';
import WorkerInvoke from '../util/worker-invoke';
import RuntimeUtil from './runtime-util';
import DatasetScanResult from './dataset-scan-result';
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
  const {
    type,
    outputText,
    sourceMapText,
    contextData,
    usableUtils,
    outputMethod,
    executionId,
  } = e.data;
  if (type === 'execute') {
    if (started) return;
    started = true;
    cache.rust.executionId = executionId;
    self.fetch = undefined as any;
    let failed = false;
    let failure: unknown;
    try {
      // Preparation also performs native I/O owned by this execution.
      const currentExecutionId = cache.rust.executionId;
      await WorkerInvoke.call('worker_init', {
        executionId: currentExecutionId,
      });
      // 予約オブジェクト群
      const reserveObjects: { name: string; value: any }[] = usableUtils.map(
        (r) => {
          return {
            name: `$${r}`,
            value: DeclareUtil.createUtilObject(r, cache),
          };
        },
      );

      // 遅延ロード（ランタイム時検索）
      const tasks = contextData.datasets
        .filter((d) => d.targets == null)
        .map(async (ds) => {
          const req: TauriDto.ScanRequest = {
            rootPath: DataUtil.getAppliedEnvValue(
              ds.rootPath,
              contextData.envs,
            ),
            ...ds.scanOption,
          };
          const res = await WorkerInvoke.call<DatasetState.ScanResponse>(
            'scan_directory',
            { req },
          );
          cache.preparation.datasetMap.push({
            key: ds.varName,
            targets: DatasetScanResult.getTargets(res.node),
          });
        });
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }

      post({
        type: 'prepared',
      });
      if (outputMethod === 'plain') {
        post({
          type: 'create_stream',
          props: {
            id: RuntimeUtil.PLAIN_CHANNEL_ID,
            view: 'text',
            detail: {},
          },
        });
        await WorkerInvoke.call('add_channel', {
          executionId: currentExecutionId,
          channelId: RuntimeUtil.PLAIN_CHANNEL_ID,
        });
      }

      const contextObjects = ContextDataUtil.createObjects(
        contextData,
        cache.preparation,
        cache.rust,
      );

      // ユーザーコードの return でも正常終了できるよう、done 通知は外側で行う
      const wrappedCode = `return (async () => {${outputText}\n})()`;
      const func = new Function(
        ...reserveObjects
          .map((f) => f.name)
          .concat(contextObjects.map((d) => d.name)),
        wrappedCode,
      );

      try {
        await func(
          ...reserveObjects
            .map((f) => f.value)
            .concat(contextObjects.map((d) => d.value)),
        );
      } catch (err) {
        if (!DclRuntime.isExitSignal(err)) throw err;
      }
    } catch (err) {
      failed = true;
      failure = err;
    }

    try {
      // Registration is also observed for empty channels. Flush emitted lines on errors too.
      await Promise.all(cache.rust.channelReady?.values() ?? []);
    } catch (err) {
      if (!failed) failure = err;
      failed = true;
    }
    try {
      await scheduler.finish();
    } catch (err) {
      if (!failed) failure = err;
      failed = true;
    }
    if (failed) {
      post({
        type: 'runtime-error',
        stack:
          failure instanceof Error
            ? (failure.stack ?? failure.message)
            : String(failure),
        sourceMap: sourceMapText,
      });
    } else {
      post({ type: 'done', vfs: cache.vfs });
    }
  }
};
