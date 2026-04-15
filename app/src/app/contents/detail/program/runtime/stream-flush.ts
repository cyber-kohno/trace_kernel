// runtime/flush/flush_scheduler.ts

type FlushDeps = {
    getBatches(channelId: string): string[][];
    hasPending(channelId: string): boolean;

    appendToRuntime(
        channelId: string,
        batches: string[][]
    ): Promise<void>;

    notifyUI(channelId: string): void;

    hasAnyPending(): boolean;
    getActiveChannelIds(): string[];
};

export type FlushScheduler = {
    schedule(channelId: string): void;
};

export function createFlushScheduler(deps: FlushDeps): FlushScheduler {
    let flushing = false;
    let flushScheduled = false;

    // function schedule(channelId: string) {
    //     if (flushScheduled) return;
    //     flushScheduled = true;

    //     Promise.resolve().then(async () => {
    //         flushScheduled = false;
    //         await flush(channelId);
    //     });
    // }
    function schedule() {
        if (flushScheduled) return;
        flushScheduled = true;

        Promise.resolve().then(async () => {
            flushScheduled = false;
            await flushAll();
        });
    }


    // async function flush(channelId: string) {
    //     if (flushing) return;
    //     flushing = true;

    //     try {
    //         const batches = deps.getBatches(channelId);

    //         if (batches.length > 0) {
    //             await deps.appendToRuntime(channelId, batches);
    //         }
    //     } finally {
    //         flushing = false;
    //     }

    //     deps.notifyUI(channelId);

    //     // flush中に追加されていたら再度
    //     if (deps.hasPending(channelId)) {
    //         schedule(channelId);
    //     }
    // }

    async function flushAll() {
        if (flushing) return;
        flushing = true;

        try {
            for (const channelId of deps.getActiveChannelIds()) {
                const batches = deps.getBatches(channelId);
                if (batches.length > 0) {
                    await deps.appendToRuntime(channelId, batches);
                    deps.notifyUI(channelId);
                }
            }
        } finally {
            flushing = false;
        }

        if (deps.hasAnyPending()) {
            schedule();
        }
    }


    return { schedule };
}
