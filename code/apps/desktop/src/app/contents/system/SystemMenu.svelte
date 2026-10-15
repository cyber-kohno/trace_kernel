<script lang="ts">
  import { dirtyStore } from '../../state/store';
  import { uiStore } from '../../state/store';
  import WorkspaceState from '../../state/model/workspace/workspace-state';
  import { workspaceStore } from '../../state/store';
  import OperationButton from '../../util/button/OperationButton.svelte';
  import FileUtil from '../../util/data/file-util';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import {
    createDiagnosticMonitor,
    diagnosticState,
    emptyDiagnostics,
  } from '../../mcp/mcp-diagnostics';
  import McpSessionBadge from '../../mcp/McpSessionBadge.svelte';
  import type {
    McpSessionInfo,
    McpSessionState,
    McpDiagnostics,
  } from '../../mcp/mcp-session-types';

  let mcpState: McpSessionState = 'stopped';
  let mcpSession: McpSessionInfo | null = null;
  let mcpBusy = false;
  let diagnostics = emptyDiagnostics();
  let diagnosticError = '';
  let operationError = '';
  let monitor: ReturnType<typeof createDiagnosticMonitor> | undefined;
  export let onRestart: () => Promise<void>;

  onMount(() => {
    monitor = createDiagnosticMonitor(
      () => invoke<McpDiagnostics>('mcp_diagnostics'),
      (value) => {
        diagnostics = value;
        mcpSession = value.session;
        mcpState = diagnosticState(value);
        diagnosticError = '';
      },
      () => {
        diagnosticError =
          'MCP status is unavailable. Publication and communication cannot be confirmed.';
      },
      (callback) => {
        const timer = setTimeout(callback, 1000);
        return () => clearTimeout(timer);
      },
    );
    return () => monitor?.dispose();
  });

  const toggleMcp = async () => {
    if (!$workspaceStore.workspace || mcpBusy) return;
    mcpBusy = true;
    monitor?.pause();
    operationError = '';
    try {
      if (mcpSession) {
        mcpState = 'stopping';
        await invoke('mcp_stop_session');
        mcpSession = null;
        mcpState = 'stopped';
        diagnostics = emptyDiagnostics();
      } else {
        mcpState = 'starting';
        mcpSession = await invoke<McpSessionInfo>('mcp_start_session');
        mcpState = 'available';
        diagnostics = {
          ...emptyDiagnostics(),
          session: mcpSession,
          published: true,
        };
      }
    } catch {
      operationError =
        'MCP start/stop failed. Check status and retry; if cleanup is pending, stop MCP again.';
      mcpState = 'error';
    } finally {
      mcpBusy = false;
      monitor?.resume();
    }
  };

  const closeWorkspace = () => {
    const exec = async () => {
      if (mcpBusy) return;
      mcpBusy = true;
      monitor?.pause();
      operationError = '';
      try {
        await invoke('mcp_stop_session');
        mcpSession = null;
        diagnostics = emptyDiagnostics();
        mcpState = 'stopped';
        $workspaceStore.workspace = null;
        $workspaceStore.handlePath = null;
        $uiStore.target = null;
        $uiStore.dialog = null;
        FileUtil.updateAppTitle();
      } catch {
        operationError =
          'MCP could not stop. The workspace remains open; retry Stop MCP before closing.';
        mcpState = 'error';
      } finally {
        mcpBusy = false;
        monitor?.resume();
      }
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
      isDisable={!isOpenProject || mcpBusy}
      callback={closeWorkspace}
      isLineup
    />
    <OperationButton name={'Setting'} callback={openSettingDialog} isLineup />
    <OperationButton name={'Restart'} callback={onRestart} isLineup />
  </div>
  {#if isOpenProject}
    <div class="mcp-control">
      <McpSessionBadge
        isOpenProject={true}
        state={diagnosticError ? 'error' : mcpState}
        session={mcpSession}
        busy={mcpBusy}
        {diagnostics}
        diagnosticError={diagnosticError || operationError}
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
