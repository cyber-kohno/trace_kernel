import type StoreDataset from "../../../../store/storeDataset";
import type StoreWork from "../../../../store/StoreWork";
import type { ScanRequest } from "../../../../store/types";
import DataUtil from "../../../../util/data/dataUtil";
import WorkerAdapter from "../ui/workerAdapter";
import DeclareUtil from "../util/declareUtil";
import ContextDataUtil from "../util/contextDataUtil";
import WorkerInvoke from "../util/workerInvoke";
import RuntimeUtil from "./runtimeUtil";
import { createFlushScheduler } from "./streamFlush";

export interface MessageProps {
    type: "execute" | 'invoke-result';
    outputText: string;
    sourceMapText: string;
    injectionalData: ContextDataUtil.Props;
    usableUtils: DeclareUtil.ReserveDef[];
    outputMethod: StoreWork.OutputMethod;
}

export interface StateMessage {
    type: "state";
    method: "createProgress" | "createMonitor" | 'tick' | 'setMonitor';
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
        await WorkerInvoke.call("append_lines", {
            workerId: cache.rust.workerId,
            channelId,
            batches,
        });
    },

    notifyUI(channelId) {
        WorkerAdapter.post({ type: "receive_stream", channelId });
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
    }
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
        workerId: 'a',//crypto.randomUUID(),
        logQueues: new Map<string, string[][]>,
    },
    scheduleFlush,
    createVFS: () => {
        const txCache = RuntimeUtil.getInitialVfsState();
        cache.vfs = txCache;
        return txCache;
    }
}

self.onmessage = async (e: MessageEvent<MessageProps>) => {
    const { type, outputText, sourceMapText, injectionalData, usableUtils, outputMethod } = e.data;
    if (type === "execute") {

        self.fetch = undefined as any;

        const $done = () => WorkerAdapter.post({ type: "done", vfs: cache.vfs });

        // 予約オブジェクト群
        const reserveObjects: { name: string, value: any }[] = usableUtils.map(r => {
            return { name: `$${r}`, value: DeclareUtil.createUtilObject(r, cache) };
        });

        // 遅延ロード（ランタイム時検索）
        const tasks = injectionalData.datasets
            .filter(d => d.targets == null)
            .map(async ds => {
                const req: ScanRequest = {
                    rootPath: DataUtil.getAppliedEnvValue(ds.rootPath, injectionalData.envs),
                    ...ds.scanOption
                };
                const res = await WorkerInvoke.call<StoreDataset.ScanResponse>('scan_directory', { req });
                const list: string[] = [];
                const rec = (node: StoreDataset.PayloadNode, curPath: string) => {
                    const nextPath = `${curPath}\\${node.name}`;
                    // 相対パスの先頭がルートのディレクトリと重複するので間引く
                    if (node.children == null) list.push(`\\${nextPath.split('\\').slice(2).join('\\')}`);
                    else node.children.forEach(n => rec(n, nextPath));
                }
                rec(res.node, '');
                cache.prepar.datasetMap.push({ key: ds.varName, targets: list });
            });
        if (tasks.length > 0) {
            await Promise.all(tasks);
        }

        // 初期化
        const workerId = cache.rust.workerId;
        await WorkerInvoke.call('worker_init', { workerId });
        if (outputMethod === 'plain') {
            WorkerAdapter.post({
                type: 'create_stream', props: {
                    id: RuntimeUtil.PLAIN_CHANNEL_ID,
                    view: 'text',
                    detail: {}
                }
            });
            await WorkerInvoke.call('add_channel', { workerId, channelId: RuntimeUtil.PLAIN_CHANNEL_ID });
        }
        // await new Promise((resolve) => setTimeout(resolve, 1000));
        WorkerAdapter.post({
            type: "prepar_end"
        });

        const injectionalObjects = ContextDataUtil.createObjects(injectionalData, cache.prepar);

        // ユーザコードから関数を作成（returnは内部Promiseのrejectをcatchするため）
        const wrappedCode = `return (async () => {${outputText}\n$done();})()`;
        const func = new Function(...(
            reserveObjects.map(f => f.name)
                .concat(injectionalObjects.map(d => d.name))
                .concat('$done')
        ), wrappedCode);

        // 実行
        try {
            await func(...(
                reserveObjects.map(f => f.value)
                    .concat(injectionalObjects.map(d => d.value))
                    .concat($done)
            ));
        } catch (err: any) {
            console.log();
            WorkerAdapter.post({
                type: "runtime-error",
                stack: err.stack,
                sourceMap: sourceMapText,
            });
        }
    }
};
