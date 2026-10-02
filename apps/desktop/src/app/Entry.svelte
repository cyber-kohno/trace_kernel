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
  import updateDirty from './service/dirty/update-dirty';
  import WorkspaceRecoveryUtil from './util/data/workspace-recovery-util';
  import { handleMcpWorkspaceRequest } from './mcp/mcp-workspace-handler';

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
        const stopMcp = async () => {
          try {
            await invoke('mcp_stop_session');
          } catch (error) {
            console.warn('Could not stop MCP session during shutdown.', error);
          }
        };

        if (get(workspaceStore).workspace == null) {
          await stopMcp();
          return;
        }
        if (!get(dirtyStore)) {
          await stopMcp();
          return;
        }

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
          await stopMcp();
          await mainWindow.close();
        }
      });

      await listen<{ id: string; method: string; params: unknown }>(
        'trace-kernel://mcp/request',
        async (event) => {
          console.info('MCP request received', event.payload);
          try {
            const result = handleMcpWorkspaceRequest({
              method: event.payload.method,
              params: event.payload.params as globalThis.Record<
                string,
                unknown
              >,
            });
            await invoke('mcp_respond', {
              response: { id: event.payload.id, result, error: null },
            });
          } catch (error) {
            await invoke('mcp_respond', {
              response: {
                id: event.payload.id,
                result: null,
                error: {
                  code: 'REQUEST_FAILED',
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              },
            });
          }
        },
      );

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
  <div class="workspace-content">
    {#if $appStore.migration != null}
      <WorkspaceMigrationScreen />
    {:else if $appStore.apiWarning != null}
      <ApiWarningScreen />
    {:else if $workspaceStore.workspace != null}
      <WorkspaceSplitView />
    {:else}
      <StartFrame />
    {/if}
  </div>
  <DialogManager />
  <ToastFrame />
{/if}

<style>
  .workspace-content {
    position: relative;
    z-index: 0;
    height: calc(100% - 30px);
  }
</style>
