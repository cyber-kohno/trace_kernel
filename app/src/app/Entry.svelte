<script lang="ts">
  import { onMount } from 'svelte';
  import { appStore, dirtyStore, uiStore, workspaceStore } from './state/store';
  import FileUtil from './util/data/file-util';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { Window } from '@tauri-apps/api/window';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { get } from 'svelte/store';
  import SystemMenu from './contents/system/SystemMenu.svelte';
  import WorkspaceSplitView from './contents/system/WorkspaceSplitView.svelte';
  import DialogManager from './contents/detail/DialogManager.svelte';
  import LicenseUtil from './contents/detail/setting/license/license-util';
  import ToastFrame from './util/item/ToastFrame.svelte';
  import StartFrame from './contents/system/StartFrame.svelte';
  import ApiWarningScreen from './contents/system/ApiWarningScreen.svelte';
  import WorkspaceMigrationScreen from './contents/system/WorkspaceMigrationScreen.svelte';
  import Record from './util/layout/RecordDiv.svelte';
  import updateDirty from './service/dirty/update-dirty';
  import WorkspaceRecoveryUtil from './util/data/workspace-recovery-util';

  let args: string[] | null = null;
  let isClosing = false;

  async function revealMainWindow() {
    const mainWindow = Window.getCurrent();
    await mainWindow.show();

    const splashscreen = await Window.getByLabel('splashscreen');
    await splashscreen?.close();
  }

  onMount(async () => {
    try {
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

      const mainWindow = Window.getCurrent();
      await mainWindow.onCloseRequested(async (event) => {
        if (isClosing) return;
        if (get(workspaceStore).workspace == null) return;
        if (!get(dirtyStore)) return;

        event.preventDefault();

        const shouldClose = await ask(
          'There are unsaved changes. Do you want to close Trace Kernel?',
          {
            title: 'Unsaved Changes',
            kind: 'warning',
          },
        );

        if (shouldClose) {
          isClosing = true;
          await mainWindow.close();
        }
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

      updateDirty();
    } catch (e) {
      console.error(e);
    } finally {
      await revealMainWindow();
    }
  });
</script>

{#if args != null}
  <SystemMenu />
  <Record surplus={30}>
    {#if $appStore.migration != null}
      <WorkspaceMigrationScreen />
    {:else if $appStore.apiWarning != null}
      <ApiWarningScreen />
    {:else if $workspaceStore.workspace != null}
      <WorkspaceSplitView />
    {:else}
      <StartFrame />
    {/if}
  </Record>
  <DialogManager />
  <ToastFrame />
{/if}
