import { writable } from "svelte/store";
import FileUtil from "../util/data/fileUtil";
import store from "./store";
import type StoreWorkspace from "./storeWorkspace";

export async function getHash(source: string) {
    const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(source)
    );
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

export type SnapshotLog = {
    env: string;
    resource: string;
    dataset: string;
    process: string;
    declare: string;
    work: string;
};

const isMatch = (a: SnapshotLog, b: SnapshotLog) => {
    return a.env === b.env && a.resource === b.resource && a.dataset === b.dataset && a.process === b.process
        && a.declare === b.declare && a.work === b.work;
}

export const getSnapshot = async (workspace: StoreWorkspace.Props): Promise<SnapshotLog> => {
    const { envs, resources, datasets, processes, declare, works } = workspace;
    return {
        env: await getHash(JSON.stringify(envs)),
        resource: await getHash(JSON.stringify(resources)),
        dataset: await getHash(JSON.stringify(datasets)),
        process: await getHash(JSON.stringify(processes)),
        declare: await getHash(JSON.stringify(declare)),
        work: await getHash(JSON.stringify(works))
    }
}

export const dirty = writable(true);

export const updateDirty = () => {

    store.subscribe(async (s) => {
        if (!s.workspace) return;

        let newSnapshot = { ...s.snapshot };

        const { envs, resources, datasets, processes, works, declare } = s.workspace;
        if (s.target == null) {
            newSnapshot = await getSnapshot(s.workspace);
        } else {
            switch (s.target.cat) {
                case 'env': newSnapshot.env = await getHash(JSON.stringify(envs)); break;
                case 'resource': newSnapshot.env = await getHash(JSON.stringify(resources)); break;
                case 'dataset': newSnapshot.env = await getHash(JSON.stringify(datasets)); break;
                case 'process': newSnapshot.env = await getHash(JSON.stringify(processes)); break;
                case 'work': {
                    newSnapshot.declare = await getHash(JSON.stringify(declare));
                    newSnapshot.work = await getHash(JSON.stringify(works));
                    break;
                }
            }
        }

        dirty.update(prev => {
            const nextDirty = !isMatch(s.snapshot, newSnapshot);
            if (prev === nextDirty) return prev;
            return nextDirty;
        });

        FileUtil.updateAppTitle();
    });
}