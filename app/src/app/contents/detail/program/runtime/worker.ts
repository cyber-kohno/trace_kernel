import type DatasetState from '../../../../state/model/workspace/dataset-state';
import type WorkState from '../../../../state/model/workspace/work-state';
import type TauriDto from '../../../../infra/tauri/tauri-dto';
import DataUtil from '../../../../util/data/data-util';
import WorkerAdapter from '../ui/worker-adapter';
import DeclareUtil from '../util/declare-util';
import ContextDataUtil from '../util/context-data-util';
import DclRuntime from '../util/dcl-runtime';
import WorkerInvoke from '../util/worker-invoke';
import RuntimeUtil from './runtime-util';
import { createFlushScheduler } from './stream-flush';

export interface MessageProps {
  type: 'execute' | 'invoke-result';
  outputText: string;
  sourceMapText: string;
  injectionalData: ContextDataUtil.Props;
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

  hasPending(channelId) {
    const queue = cache.rust.logQueues.get(channelId);
    return !!queue && queue.length > 0;
  },

  async appendToRuntime(channelId, batches) {
    await WorkerInvoke.call('append_lines', {
      workerId: cache.rust.workerId,
      channelId,
      batches,
    });
  },

  notifyUI(channelId) {
    WorkerAdapter.post({ type: 'receive_stream', channelId });
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
  prepar: { datasetMap: [] },
  vfs: null,
  rust: {
    workerId: 'a', //crypto.randomUUID(),
    logQueues: new Map<string, string[][]>(),
  },
  scheduleFlush,
  createVFS: () => {
    const txCache = RuntimeUtil.getInitialVfsState();
    cache.vfs = txCache;
    return txCache;
  },
};

self.onmessage = async (e: MessageEvent<MessageProps>) => {
  const {
    type,
    outputText,
    sourceMapText,
    injectionalData,
    usableUtils,
    outputMethod,
  } = e.data;
  if (type === 'execute') {
    self.fetch = undefined as any;

    const $done = () => WorkerAdapter.post({ type: 'done', vfs: cache.vfs });

    // 予約オブジェクト群
    const reserveObjects: { name: string; value: any }[] = usableUtils.map(
      (r) => {
        return { name: `$${r}`, value: DeclareUtil.createUtilObject(r, cache) };
      },
    );

    // 遅延ロード（ランタイム時検索）
    const tasks = injectionalData.datasets
      .filter((d) => d.targets == null)
      .map(async (ds) => {
        const req: TauriDto.ScanRequest = {
          rootPath: DataUtil.getAppliedEnvValue(
            ds.rootPath,
            injectionalData.envs,
          ),
          ...ds.scanOption,
        };
        const res = await WorkerInvoke.call<DatasetState.ScanResponse>(
          'scan_directory',
          { req },
        );
        const list: string[] = [];
        const rec = (node: DatasetState.PayloadNode, curPath: string) => {
          const nextPath = `${curPath}\\${node.name}`;
          // 相対パスの先頭がルートのディレクトリと重複するので間引く
          if (node.children == null)
            list.push(`\\${nextPath.split('\\').slice(2).join('\\')}`);
          else node.children.forEach((n) => rec(n, nextPath));
        };
        rec(res.node, '');
        cache.prepar.datasetMap.push({ key: ds.varName, targets: list });
      });
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    // Initialize the runtime worker before executing user code.
    const workerId = cache.rust.workerId;
    await WorkerInvoke.call('worker_init', { workerId });
    WorkerAdapter.post({
      type: 'prepar_end',
    });
    if (outputMethod === 'plain') {
      WorkerAdapter.post({
        type: 'create_stream',
        props: {
          id: RuntimeUtil.PLAIN_CHANNEL_ID,
          view: 'text',
          detail: {},
        },
      });
      await WorkerInvoke.call('add_channel', {
        workerId,
        channelId: RuntimeUtil.PLAIN_CHANNEL_ID,
      });
    }

    const injectionalObjects = ContextDataUtil.createObjects(
      injectionalData,
      cache.prepar,
      cache.rust,
    );

    // ユーザーコードの return でも正常終了できるよう、done 通知は外側で行う
    const wrappedCode = `return (async () => {${outputText}\n})()`;
    const func = new Function(
      ...reserveObjects
        .map((f) => f.name)
        .concat(injectionalObjects.map((d) => d.name)),
      wrappedCode,
    );

    let shouldNotifyDone = false;
    try {
      await func(
        ...reserveObjects
          .map((f) => f.value)
          .concat(injectionalObjects.map((d) => d.value)),
      );
      shouldNotifyDone = true;
    } catch (err: any) {
      if (DclRuntime.isExitSignal(err)) {
        shouldNotifyDone = true;
      } else {
        console.log();
        WorkerAdapter.post({
          type: 'runtime-error',
          stack: err.stack,
          sourceMap: sourceMapText,
        });
      }
    } finally {
      if (shouldNotifyDone) {
        $done();
      }
    }
  }
};
