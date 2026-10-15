<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type {
    McpSessionInfo,
    McpDiagnostics,
    McpSessionState,
  } from './mcp-session-types';
  import { emptyDiagnostics } from './mcp-diagnostics';
  import { PRODUCT_INFO } from '../product-info';
  import McpDiagnosticsDialog from './McpDiagnosticsDialog.svelte';

  export let isOpenProject: boolean;
  export let state: McpSessionState = 'stopped';
  export let session: McpSessionInfo | null = null;
  export let diagnostics: McpDiagnostics = emptyDiagnostics();
  export let diagnosticError = '';
  export let busy = false;
  export let onToggle: () => void;
  export let dialogOpen = false;

  let expanded = false;
  let showDiagnostics = false;
  let copied = '';
  let copyFailed = false;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let root: HTMLDivElement;
  let badge: HTMLButtonElement;

  $: if (!isOpenProject || dialogOpen) {
    expanded = false;
    showDiagnostics = false;
  }

  onMount(() => {
    const dismissOutside = (event: Event) => {
      if (expanded && !event.composedPath().includes(root)) expanded = false;
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (expanded && event.key === 'Escape') {
        expanded = false;
        event.preventDefault();
        event.stopPropagation();
        badge.focus();
      }
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('focusin', dismissOutside, true);
    document.addEventListener('keydown', dismissEscape, true);
    return () => {
      disposed = true;
      clearTimeout(copyTimer);
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('focusin', dismissOutside, true);
      document.removeEventListener('keydown', dismissEscape, true);
    };
  });

  const labels: Record<McpSessionState, string> = {
    stopped: 'OFF',
    starting: 'Starting',
    available: 'Published',
    verified: 'Verified request',
    stopping: 'Stopping',
    error: 'Error',
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      if (disposed) return;
      copyFailed = false;
      copied = label;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = ''), 1200);
    } catch {
      if (!disposed) copyFailed = true;
    }
  };

  const handleBadgeClick = () => {
    if (!dialogOpen) expanded = !expanded;
  };

  const openDiagnostics = () => {
    expanded = false;
    showDiagnostics = true;
  };

  const closeDiagnostics = async () => {
    showDiagnostics = false;
    await tick();
    badge?.focus();
  };

  // Keep the small panel within the viewport, even when the badge is near an edge.
  const positionPopover = (node: HTMLDivElement) => {
    const position = () => {
      const anchor = badge.getBoundingClientRect();
      const panel = node.getBoundingClientRect();
      const margin = 8;
      node.style.left = `${Math.max(margin, Math.min(anchor.right - panel.width, window.innerWidth - panel.width - margin))}px`;
      const below = anchor.bottom + 4;
      node.style.top = `${Math.max(margin, Math.min(below, window.innerHeight - panel.height - margin))}px`;
    };
    const observer = new ResizeObserver(position);
    observer.observe(node);
    observer.observe(badge);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    position();
    return {
      destroy() {
        observer.disconnect();
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
      },
    };
  };
</script>

<div class="mcp-root" bind:this={root}>
  <button
    bind:this={badge}
    class="badge {state}"
    class:busy
    aria-label="MCP session"
    aria-expanded={expanded}
    aria-controls={expanded ? 'mcp-session-details' : undefined}
    disabled={busy || dialogOpen || showDiagnostics}
    onclick={handleBadgeClick}
  >
    <span class="dot"></span>
    <span class="name">MCP</span>
    <span class="status">{labels[state]}</span>
  </button>

  {#if expanded}
    <div
      class="popover"
      use:positionPopover
      id="mcp-session-details"
      role="region"
      aria-label="MCP session controls"
    >
      <div class="popover-title">
        <strong
          >MCP <span class="generation"
            >gen {PRODUCT_INFO.bridgeProtocolGen}</span
          ></strong
        >
        <button
          class="close"
          aria-label="Close"
          onclick={() => (expanded = false)}>×</button
        >
      </div>

      <div class="state-line {state}">
        <span class="dot"></span>
        {#if state === 'available'}
          Ready to receive requests
        {:else if state === 'verified'}
          Compatible request received (history)
        {:else}
          {labels[state]}
        {/if}
      </div>

      {#if diagnosticError}
        <div class="notice">MCP status needs attention. See diagnostics.</div>
      {:else if diagnostics.session && !diagnostics.published}
        <div class="notice">Cleanup pending. Retry Stop MCP.</div>
      {/if}

      {#if !isOpenProject}
        <div class="notice">Open a project to publish an MCP session.</div>
      {/if}

      {#if session}
        <div class="field">
          <span>Session ID</span>
          <div class="value">
            <code
              >{session.sessionId.slice(0, 8)}...{session.sessionId.slice(
                -4,
              )}</code
            ><button onclick={() => copy('session', session.sessionId)}
              >{copied === 'session' ? 'Copied' : 'Copy'}</button
            >
          </div>
        </div>
      {/if}

      {#if copyFailed}
        <div class="notice" role="status">
          Copy failed. See diagnostics to copy manually.
        </div>
      {/if}

      <div class="diagnostic-link">
        {#if diagnostics.rejectedRequests > 0}
          <span class="warning"
            >Compatibility rejects: {diagnostics.rejectedRequests}</span
          >
        {:else}
          <span></span>
        {/if}
        <button class="details" onclick={openDiagnostics}>Diagnostics</button>
      </div>
      <button
        class="toggle"
        disabled={!isOpenProject || busy}
        onclick={onToggle}>{session ? 'Stop MCP' : 'Publish MCP'}</button
      >
    </div>
  {/if}
</div>

{#if showDiagnostics}
  <McpDiagnosticsDialog
    {state}
    {session}
    {diagnostics}
    {diagnosticError}
    onClose={closeDiagnostics}
  />
{/if}

<style>
  .mcp-root {
    display: inline-flex;
    position: relative;
    align-items: center;
    height: 30px;
    font:
      12px system-ui,
      sans-serif;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 9px;
    border: 1px solid #9aa7c2;
    border-radius: 12px;
    color: #ffffff;
    background: #34405a;
    cursor: pointer;
    font-weight: 600;
  }
  .badge:hover:not(:disabled) {
    filter: brightness(1.2);
  }
  .badge:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #8c94a8;
    box-shadow: 0 0 0 2px #8c94a833;
  }
  .available {
    border-color: #5ecbff;
    background: #075b83;
  }
  .available .dot {
    background: #7bd8ff;
    box-shadow: 0 0 0 2px #7bd8ff66;
  }
  .verified {
    border-color: #63e6a0;
    background: #12633f;
  }
  .verified .dot {
    background: #8affbd;
    box-shadow: 0 0 0 2px #8affbd66;
  }
  .starting,
  .stopping {
    border-color: #ffd166;
    background: #805b08;
  }
  .starting .dot,
  .stopping .dot {
    background: #ffe39a;
    animation: pulse 1s infinite;
  }
  .error {
    border-color: #ff7b85;
    background: #8a2633;
  }
  .error .dot {
    background: #ffb0b6;
    box-shadow: 0 0 0 2px #ffb0b666;
  }
  .popover {
    position: fixed;
    z-index: 1;
    width: 320px;
    max-width: calc(100vw - 16px);
    box-sizing: border-box;
    padding: 12px;
    border: 1px solid #56617d;
    border-radius: 8px;
    color: #e8ebf5;
    background: #202536;
    box-shadow: 0 8px 24px #0008;
  }
  .popover-title,
  .value,
  .state-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .generation {
    margin-left: 8px;
    color: #aeb6ca;
    font-weight: 400;
  }
  .close {
    border: 0;
    color: #aeb6ca;
    background: transparent;
    font-size: 20px;
    cursor: pointer;
  }
  .state-line {
    justify-content: flex-start;
    gap: 7px;
    margin: 8px 0;
    color: #aeb6ca;
  }
  .state-line.verified {
    color: #65dda0;
  }
  .state-line.available {
    color: #69c2ff;
  }
  .state-line.error {
    color: #f48b94;
  }
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 8px 0;
    color: #929bb1;
    font-size: 10px;
  }
  .value {
    gap: 6px;
    min-width: 0;
  }
  .value code {
    overflow: hidden;
    color: #eef1f8;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .value button {
    flex: 0 0 auto;
    border: 1px solid #59647e;
    border-radius: 4px;
    color: #cbd3e5;
    background: #303950;
    font-size: 10px;
    cursor: pointer;
  }
  .notice {
    padding: 8px;
    border: 1px solid #665d3e;
    border-radius: 4px;
    color: #f0d88a;
    background: #40391f;
    font-size: 11px;
  }
  .diagnostic-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 8px 0;
    font-size: 11px;
  }
  .warning {
    color: #ead39d;
  }
  .details {
    padding: 2px 0;
    border: 0;
    color: #a8caff;
    background: transparent;
    text-decoration: underline;
    cursor: pointer;
  }
  .toggle {
    width: 100%;
    height: 28px;
    border: 1px solid #687797;
    border-radius: 4px;
    color: #f1f4fb;
    background: #384764;
    cursor: pointer;
  }
  .toggle:hover:not(:disabled) {
    background: #49618c;
  }
  .toggle:disabled {
    opacity: 0.5;
    cursor: default;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
</style>
