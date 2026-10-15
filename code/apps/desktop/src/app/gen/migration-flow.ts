import Core from '../../../../../packages/runtime-core/src/workspace/workspace-migration';
import DirtyUtil from '../service/dirty/dirty-util';
import { CURRENT_GEN } from './gen-version.js';
import FileUtil from '../util/data/file-util';
import ValidationService from '../service/validation-service';
import { appStore, workspaceStore } from '../state/store';

namespace MigrationFlow {
  export type Status = Core.Status;
  export type Diff = Core.Diff;
  export type State = Core.State;
  export const create = Core.create;

  export const clear = () => {
    appStore.update((curr) => ({
      ...curr,
      migration: null,
    }));
  };

  export const start = (state: State): Promise<State> =>
    Core.start(state, CURRENT_GEN);

  export const open = async (state: State) => {
    if (state.status !== 'succeeded' || state.migrated == null) return;
    const snapshot = await DirtyUtil.getSnapshot(state.migrated);
    workspaceStore.update((curr) => ({
      ...curr,
      handlePath: null,
      workspace: state.migrated,
      snapshot,
    }));
    clear();
    ValidationService.validateAll();
    await FileUtil.updateAppTitle();
  };
}

export default MigrationFlow;
