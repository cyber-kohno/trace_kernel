<script lang="ts">
  import { dirtyStore } from '../../state/store';
  import { uiStore } from '../../state/store';
  import WorkspaceState from '../../state/model/workspace/workspace-state';
  import { workspaceStore } from '../../state/store';
  import OperationButton from '../../util/button/OperationButton.svelte';
  import FileUtil from '../../util/data/file-util';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { relaunch } from '@tauri-apps/plugin-process';
  import WorkspaceRecoveryUtil from '../../util/data/workspace-recovery-util';
  import { invoke } from '@tauri-apps/api/core';
  import McpSessionBadge from '../../mcp/McpSessionBadge.svelte';
  import type {
    McpSessionInfo,
    McpSessionState,
  } from '../../mcp/mcp-session-types';

  let mcpState: McpSessionState = 'stopped';
  let mcpSession: McpSessionInfo | null = null;
  let mcpBusy = false;

  const toggleMcp = async () => {
    if (!$workspaceStore.workspace || mcpBusy) return;
    mcpBusy = true;
    try {
      if (mcpState !== 'stopped' && mcpState !== 'error') {
        mcpState = 'stopping';
        await invoke('mcp_stop_session');
        mcpSession = null;
        mcpState = 'stopped';
      } else {
        mcpState = 'starting';
        mcpSession = await invoke<McpSessionInfo>('mcp_start_session');
        mcpState = 'available';
      }
    } catch (error) {
      console.error(error);
      mcpState = 'error';
    } finally {
      mcpBusy = false;
    }
  };

  const closeWorkspace = () => {
    const exec = async () => {
      if (mcpState !== 'stopped') {
        await invoke('mcp_stop_session');
        mcpSession = null;
        mcpState = 'stopped';
      }
      $workspaceStore.workspace = null;
      $workspaceStore.handlePath = null;
      $uiStore.target = null;
      $uiStore.dialog = null;
      FileUtil.updateAppTitle();
    };
    if (!$dirtyStore) {
      void exec();
    } else {
      ask('There is unsaved data. Can I delete it?', {
        title: 'Close workspace',
      }).then((isOk) => {
        if (isOk) void exec();
      });
    }
  };

  const openSettingDialog = () => {
    $uiStore.dialog = 'setting';
  };

  const executeRestart = async () => {
    if (mcpState !== 'stopped') {
      await invoke('mcp_stop_session');
      mcpSession = null;
      mcpState = 'stopped';
    }
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

<div class="system-menu">
  <div class="system-actions">
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
  </div>
  {#if isOpenProject}
    <div class="mcp-control">
      <McpSessionBadge
        isOpenProject={true}
        state={mcpState}
        session={mcpSession}
        busy={mcpBusy}
        onToggle={toggleMcp}
        dialogOpen={$uiStore.dialog != null}
      />
    </div>
  {/if}
</div>

<style>
  .system-menu {
    display: flex;
    align-items: center;
    position: relative;
    z-index: 1;
    width: 100%;
    height: 30px;
    padding-left: 4px;
    box-sizing: border-box;
    background: #334;
  }

  .system-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .system-actions :global(button[data--lineup='true']) {
    margin: 0;
  }

  .mcp-control {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: 50px;
  }
</style>
