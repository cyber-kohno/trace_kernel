import { invoke } from '@tauri-apps/api/core';
import workspaceStore, {
  createInitialSnapshot,
  type SnapshotLog,
} from '../../store/workspace-store';
import type StoreWorkspace from '../../store/store-workspace';
import StoreWorkspaceApi from '../../store/store-workspace';
import FileUtil from './file-util';

namespace WorkspaceRecoveryUtil {
  export type RecoverySnapshot = {
    reason: string;
    workspaceJson: string;
    handlePath: string | null;
    savedSnapshotJson?: string | null;
    startedAt: number;
  };

  export const saveBeforeProgramRun = async (props: {
    workspace: StoreWorkspace.Props;
    handlePath: string | null;
    savedSnapshot: SnapshotLog;
  }) => {
    await invoke('set_recovery_snapshot', {
      snapshot: {
        reason: 'program-running',
        workspaceJson: JSON.stringify(props.workspace),
        handlePath: props.handlePath,
        savedSnapshotJson: JSON.stringify(props.savedSnapshot),
        startedAt: Date.now(),
      },
    });
  };

  export const clear = async () => {
    await invoke('clear_recovery_snapshot');
  };

  const restoreSnapshot = async (recoverySnapshot: RecoverySnapshot) => {
    const workspace = JSON.parse(
      recoverySnapshot.workspaceJson,
    ) as StoreWorkspace.Props;
    const snapshot: SnapshotLog = recoverySnapshot.savedSnapshotJson
      ? JSON.parse(recoverySnapshot.savedSnapshotJson)
      : createInitialSnapshot();

    workspaceStore.update((curr) => ({
      ...curr,
      workspace,
      handlePath: recoverySnapshot.handlePath,
      snapshot,
    }));
    StoreWorkspaceApi.validateAll();
    await FileUtil.updateAppTitle();
  };

  export const restoreOnStartup = async (): Promise<boolean> => {
    const recoverySnapshot =
      await invoke<RecoverySnapshot | null>('get_recovery_snapshot');
    if (recoverySnapshot == null) return false;

    const shouldRestore = confirm(
      'The application did not close correctly. Do you want to restore the workspace from the last session?',
    );
    let isRestored = false;
    if (shouldRestore) {
      try {
        await restoreSnapshot(recoverySnapshot);
        isRestored = true;
      } catch (err) {
        console.error(err);
        alert('Failed to restore the workspace.');
      }
    }

    await clear();
    return isRestored;
  };
}

export default WorkspaceRecoveryUtil;
