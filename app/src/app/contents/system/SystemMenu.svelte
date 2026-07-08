<script lang="ts">
  import { dirtyStore } from '../../state/store';
  import { uiStore } from '../../state/store';
  import WorkspaceState from '../../state/model/workspace/workspace-state';
  import { workspaceStore } from '../../state/store';
  import OperationButton from '../../util/button/OperationButton.svelte';
  import FileUtil from '../../util/data/file-util';
  import Record from '../../util/layout/RecordDiv.svelte';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { relaunch } from '@tauri-apps/plugin-process';
  import WorkspaceRecoveryUtil from '../../util/data/workspace-recovery-util';

  const closeWorkspace = () => {
    const exec = () => {
      $workspaceStore.workspace = null;
      $workspaceStore.handlePath = null;
      $uiStore.target = null;
      $uiStore.dialog = null;
      FileUtil.updateAppTitle();
    };
    if (!$dirtyStore) {
      exec();
    } else {
      ask('There is unsaved data. Can I delete it?', {
        title: 'Close workspace',
      }).then((isOk) => {
        if (isOk) exec();
      });
    }
  };

  const openSettingDialog = () => {
    $uiStore.dialog = 'setting';
  };

  const executeRestart = async () => {
    await WorkspaceRecoveryUtil.clear();
    if (import.meta.env.DEV) {
      window.location.reload();
    } else {
      await relaunch();
    }
  };

  const restart = async () => {
    if (!$workspaceStore.workspace || !$dirtyStore) {
      await executeRestart();
      return;
    }

    const isOk = await ask(
      'There are unsaved changes. Do you want to restart Trace Kernel?',
      {
        title: 'Unsaved Changes',
        kind: 'warning',
      },
    );

    if (isOk) await executeRestart();
  };

  $: isOpenProject = $workspaceStore.workspace != null;
  $: saveProject = () => {
    FileUtil.saveWorkspace();
  };
</script>

<Record height={30} align="left" padding={'0 0 0 4px'} bgColor="#334">
  <OperationButton
    name={'Save'}
    isDisable={!isOpenProject || !$dirtyStore}
    callback={saveProject}
    isLineup
  />
  <OperationButton
    name={'Close'}
    isDisable={!isOpenProject}
    callback={closeWorkspace}
    isLineup
  />
  <OperationButton name={'Setting'} callback={openSettingDialog} isLineup />
  <OperationButton name={'Restart'} callback={restart} isLineup />
</Record>
