import { get } from 'svelte/store';
import {
  dirtyStore,
  uiStore,
  workspaceStore,
} from '../../state/store';
import FileUtil from '../../util/data/file-util';
import DirtyUtil from './dirty-util';

const updateDirty = () => {
  workspaceStore.subscribe(async (s) => {
    if (!s.workspace) {
      dirtyStore.set(false);
      FileUtil.updateAppTitle();
      return;
    }
    const target = get(uiStore).target;

    let newSnapshot = { ...s.snapshot };

    const { gen, envs, resources, datasets, processes, logics, works, declare } =
      s.workspace;
    if (target == null) {
      newSnapshot = await DirtyUtil.getSnapshot(s.workspace);
    } else {
      newSnapshot.gen = await DirtyUtil.getHash(JSON.stringify(gen));
      switch (target.cat) {
        case 'env':
          newSnapshot.env = await DirtyUtil.getHash(JSON.stringify(envs));
          break;
        case 'resource':
          newSnapshot.resource = await DirtyUtil.getHash(
            JSON.stringify(resources),
          );
          break;
        case 'dataset':
          newSnapshot.dataset = await DirtyUtil.getHash(
            JSON.stringify(datasets),
          );
          break;
        case 'process':
          newSnapshot.process = await DirtyUtil.getHash(
            JSON.stringify(processes),
          );
          break;
        case 'logic':
          newSnapshot.logic = await DirtyUtil.getHash(JSON.stringify(logics));
          break;
        case 'work': {
          newSnapshot.declare = await DirtyUtil.getHash(
            JSON.stringify(declare),
          );
          newSnapshot.work = await DirtyUtil.getHash(JSON.stringify(works));
          break;
        }
      }
    }

    dirtyStore.update((prev) => {
      const nextDirty = !DirtyUtil.isMatch(s.snapshot, newSnapshot);
      if (prev === nextDirty) return prev;
      return nextDirty;
    });

    FileUtil.updateAppTitle();
  });
};

export default updateDirty;
