<script lang="ts">
  import { onMount } from 'svelte';
  import { appStore, dirtyStore, uiStore, workspaceStore } from './state/store';
  import FileUtil from './util/data/file-util';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { Window } from '@tauri-apps/api/window';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { relaunch } from '@tauri-apps/plugin-process';
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
  import { cancelWorkUpdateProposalByRequestId } from './mcp/work-update-proposal';
  import ApplicationShutdown from './service/lifecycle/application-shutdown';
  import { applicationWorkers } from './service/lifecycle/worker-lifecycle';

  let args: string[] | null = null;
  let shutdownPhase: ApplicationShutdown.Phase = 'idle';
  let shutdownError = '';
  const shutdown = ApplicationShutdown.create({
    needsConfirmation: () =>
      get(workspaceStore).workspace != null && get(dirtyStore),
    confirmClose: () =>
      ask('There are unsaved changes. Do you want to close Trace Kernel?', {
        title: 'Unsaved Changes',
        kind: 'warning',
      }),
    shutdownNative: () => invoke('shutdown_native_io'),
    stopWorkers: () => applicationWorkers.stopAll(),
    stopMcp: () => invoke('mcp_stop_session'),
    closeWindow: () => Window.getCurrent().close(),
    confirmRestart: () =>
      ask('There are unsaved changes. Do you want to restart Trace Kernel?', {
        title: 'Unsaved Changes',
        kind: 'warning',
      }),
    restartApp: async () => {
      await WorkspaceRecoveryUtil.clear();
      if (import.meta.env.DEV) window.location.reload();
      else await relaunch();
    },
    onState: (phase, error) => {
      shutdownPhase = phase;
      shutdownError = error;
    },
  });

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
        if (
          !shutdown.isStopping() &&
          files.length === 1 &&
          $workspaceStore.workspace == null
        ) {
          const filePath = files[0];
          await FileUtil.loadWorkspaceFile(filePath);
        }
      });

      await FileUtil.updateAppTitle();
      const isRecoveryRestored = await WorkspaceRecoveryUtil.restoreOnStartup();

      window.addEventListener('keydown', (e) => {
        if (shutdown.isStopping()) {
          e.preventDefault();
          return;
        }
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
      await mainWindow.onCloseRequested((event) => {
        if (shutdown.canCloseWindow()) return;
        event.preventDefault();
        void shutdown.requestClose();
      });

      await listen<{ id: string; method: string; params: unknown }>(
        'trace-kernel://mcp/request',
        async (event) => {
          console.info('MCP request received', event.payload);
          try {
            if (shutdown.isStopping())
              throw new Error('Application is shutting down.');
            const result = await handleMcpWorkspaceRequest({
              id: event.payload.id,
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
            try {
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
            } catch (responseError) {
              console.info(
                'MCP request completed after its client stopped waiting.',
                responseError,
              );
            }
          }
        },
      );

      await listen<{ id: string; reason?: string }>(
        'trace-kernel://mcp/cancel',
        (event) => {
          cancelWorkUpdateProposalByRequestId(event.payload.id);
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
  <div
    class="app-content"
    inert={shutdownPhase === 'stopping' ||
      shutdownPhase === 'closing' ||
      (shutdownPhase === 'failed' && shutdown.isStopping())}
  >
    <SystemMenu onRestart={() => shutdown.requestRestart()} />
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
  </div>
{/if}

{#if shutdownPhase === 'stopping' || shutdownPhase === 'closing' || shutdownPhase === 'failed'}
  <div class="shutdown-overlay">
    <div class="shutdown-panel" role="alert">
      {#if shutdownPhase === 'failed'}
        <p>
          Trace Kernel could not {shutdown.getAction()} safely. The window will remain
          open.
        </p>
        <pre>{shutdownError}</pre>
        <button on:click={() => void shutdown.retry()}
          >Retry {shutdown.getAction()}</button
        >
      {:else}
        <p>Stopping work and waiting for native operations to finish…</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .app-content {
    height: 100%;
  }
  .shutdown-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    place-items: center;
    background: #0009;
  }
  .shutdown-panel {
    max-width: 80vw;
    padding: 24px;
    background: #fff;
    color: #222;
    font-size: 14px;
    line-height: 1.5;
    border-radius: 6px;
  }
  .shutdown-panel pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .workspace-content {
    position: relative;
    z-index: 0;
    height: calc(100% - 30px);
  }
</style>
