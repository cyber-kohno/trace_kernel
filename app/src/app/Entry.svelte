<script lang="ts">
  import { onMount } from 'svelte';
  import appStore from './store/app-store';
  import uiStore from './store/ui-store';
  import workspaceStore from './store/workspace-store';
  import FileUtil from './util/data/file-util';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import SystemMenu from './contents/system/SystemMenu.svelte';
  import WorkspaceSplitView from './contents/system/WorkspaceSplitView.svelte';
  import DialogManager from './contents/detail/DialogManager.svelte';
  import LicenseUtil from './contents/detail/setting/license/license-util';
  import ToastFrame from './util/item/ToastFrame.svelte';
  import { global } from './global';
  import StartFrame from './contents/system/StartFrame.svelte';
  import Record from './util/layout/RecordDiv.svelte';
  import { updateDirty } from './store/dirty';
  import WorkspaceRecoveryUtil from './util/data/workspace-recovery-util';

  let toastFrameRef: ToastFrame;

  let args: string[] | null = null;

  onMount(async () => {
    await listen<string[]>('file-drop', async (event) => {
      const files: string[] = event.payload;
      if (files.length === 1 && $workspaceStore.workspace == null) {
        const filePath = files[0];
        await FileUtil.loadWorkspaceFile(filePath);
      }
    });

    await FileUtil.updateAppTitle();
    const isRecoveryRestored = await WorkspaceRecoveryUtil.restoreOnStartup();

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();

        if ($workspaceStore.workspace != null) {
          FileUtil.saveWorkspace();
        }
      }
      if (
        e.key === 'F5' ||
        (e.ctrlKey && e.key === 'r') ||
        (e.ctrlKey && e.shiftKey && e.key === 'R')
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
      if ($uiStore.shortcutEvent != null) $uiStore.shortcutEvent(e);
    });
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    args = (await invoke('get_cli_args')) as string[];

    if (!isRecoveryRestored && args.length >= 2) {
      const filePath = args[1];
      await FileUtil.loadWorkspaceFile(filePath);
    }

    const payload = await LicenseUtil.loadLicenseOnStartup();
    if (payload != null) {
      $appStore.license = LicenseUtil.getConvertedLicenseFromPayload(payload);
      FileUtil.updateAppTitle();
    }

    $global.toastDisp = toastFrameRef.disp;

    updateDirty();
  });
</script>

{#if args != null}
  <SystemMenu />
  <Record surplus={30}>
    {#if $workspaceStore.workspace != null}
      <WorkspaceSplitView />
    {:else}
      <StartFrame />
    {/if}
  </Record>
  <DialogManager />
  <ToastFrame bind:this={toastFrameRef} />
{/if}
