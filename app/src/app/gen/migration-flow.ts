import DirtyUtil from '../service/dirty/dirty-util';
import { CURRENT_GEN } from './gen-version.js';
import WorkspaceState from '../state/model/workspace/workspace-state';
import FileUtil from '../util/data/file-util';
import type WorkspaceStateType from '../state/model/workspace/workspace-state';
import ValidationService from '../service/validation-service';
import { appStore, workspaceStore } from '../state/store';

namespace MigrationFlow {
  export type Status = 'idle' | 'running' | 'succeeded' | 'failed';

  export type Diff = {
    from: string;
    to: string;
  };

  export type State = {
    handlePath: string;
    workspace: WorkspaceStateType.Props;
    diff: Diff;
    status: Status;
    migrated: WorkspaceStateType.Props | null;
    errorMessage: string | null;
  };

  export const create = ({
    handlePath,
    workspace,
    diff,
  }: {
    handlePath: string;
    workspace: WorkspaceStateType.Props;
    diff: Diff;
  }): State => {
    return {
      handlePath,
      workspace,
      diff,
      status: 'idle',
      migrated: null,
      errorMessage: null,
    };
  };

  export const clear = () => {
    appStore.update((curr) => ({
      ...curr,
      migration: null,
    }));
  };

  export const start = async (state: State): Promise<State> => {
    return {
      ...state,
      status: 'succeeded',
      migrated: {
        ...state.workspace,
        gen: { ...CURRENT_GEN },
      },
      errorMessage: null,
    };
  };

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
