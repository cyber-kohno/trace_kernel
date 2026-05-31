import { get, writable } from 'svelte/store';
import FileUtil from '../util/data/file-util';
import workspaceStore, { type SnapshotLog } from './workspace-store';
import uiStore from './ui-store';
import type StoreWorkspace from './store-workspace';

export async function getHash(source: string) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const isMatch = (a: SnapshotLog, b: SnapshotLog) => {
  return (
    a.env === b.env &&
    a.resource === b.resource &&
    a.dataset === b.dataset &&
    a.process === b.process &&
    a.logic === b.logic &&
    a.declare === b.declare &&
    a.work === b.work
  );
};

export const getSnapshot = async (
  workspace: StoreWorkspace.Props,
): Promise<SnapshotLog> => {
  const { envs, resources, datasets, processes, logics, declare, works } =
    workspace;
  return {
    env: await getHash(JSON.stringify(envs)),
    resource: await getHash(JSON.stringify(resources)),
    dataset: await getHash(JSON.stringify(datasets)),
    process: await getHash(JSON.stringify(processes)),
    logic: await getHash(JSON.stringify(logics)),
    declare: await getHash(JSON.stringify(declare)),
    work: await getHash(JSON.stringify(works)),
  };
};

export const dirty = writable(false);

export const updateDirty = () => {
  workspaceStore.subscribe(async (s) => {
    if (!s.workspace) {
      dirty.set(false);
      FileUtil.updateAppTitle();
      return;
    }
    const target = get(uiStore).target;

    let newSnapshot = { ...s.snapshot };

    const { envs, resources, datasets, processes, logics, works, declare } =
      s.workspace;
    if (target == null) {
      newSnapshot = await getSnapshot(s.workspace);
    } else {
      switch (target.cat) {
        case 'env':
          newSnapshot.env = await getHash(JSON.stringify(envs));
          break;
        case 'resource':
          newSnapshot.resource = await getHash(JSON.stringify(resources));
          break;
        case 'dataset':
          newSnapshot.dataset = await getHash(JSON.stringify(datasets));
          break;
        case 'process':
          newSnapshot.process = await getHash(JSON.stringify(processes));
          break;
        case 'logic':
          newSnapshot.logic = await getHash(JSON.stringify(logics));
          break;
        case 'work': {
          newSnapshot.declare = await getHash(JSON.stringify(declare));
          newSnapshot.work = await getHash(JSON.stringify(works));
          break;
        }
      }
    }

    dirty.update((prev) => {
      const nextDirty = !isMatch(s.snapshot, newSnapshot);
      if (prev === nextDirty) return prev;
      return nextDirty;
    });

    FileUtil.updateAppTitle();
  });
};
