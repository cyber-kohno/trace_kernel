<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    McpSessionInfo,
    McpSessionSnapshot,
    McpSessionState,
  } from './mcp-session-types';

  export let isOpenProject: boolean;
  export let state: McpSessionState = 'stopped';
  export let session: McpSessionInfo | null = null;
  export let snapshot: McpSessionSnapshot = {
    clients: 0,
    requestCount: 0,
    lastRequestAt: null,
  };
  export let busy = false;
  export let onToggle: () => void;
  export let dialogOpen = false;

  let expanded = false;
  let copied = '';
  let root: HTMLDivElement;
  let badge: HTMLButtonElement;

  $: if (!isOpenProject || dialogOpen) expanded = false;

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
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('focusin', dismissOutside, true);
      document.removeEventListener('keydown', dismissEscape, true);
    };
  });

  const labels: Record<McpSessionState, string> = {
    stopped: 'OFF',
    starting: 'Starting',
    available: 'Available',
    connected: 'Connected',
    stopping: 'Stopping',
    error: 'Error',
  };

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    copied = label;
    setTimeout(() => (copied = ''), 1200);
  };

  const formatLastRequest = () => {
    if (snapshot.lastRequestAt == null) return 'Never';
    const seconds = Math.max(
      0,
      Math.floor((Date.now() - snapshot.lastRequestAt) / 1000),
    );
    return seconds < 2 ? 'Just now' : `${seconds}s ago`;
  };

  const handleBadgeClick = () => {
    if (!dialogOpen) expanded = !expanded;
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
    disabled={busy || dialogOpen}
    onclick={handleBadgeClick}
  >
    <span class="dot"></span>
    <span class="name">MCP</span>
    <span class="status">{labels[state]}</span>
    {#if state === 'connected'}<span class="count">{snapshot.clients}</span
      >{/if}
  </button>

  {#if expanded}
    <div
      class="popover"
      id="mcp-session-details"
      role="region"
      aria-label="MCP development session"
    >
      <div class="popover-title">
        <div>
          <div class="eyebrow">TRACE KERNEL</div>
          <strong>MCP Development Session</strong>
        </div>
        <button
          class="close"
          aria-label="Close"
          onclick={() => (expanded = false)}>×</button
        >
      </div>

      <div class="state-line {state}">
        <span class="dot"></span>{labels[state]}
      </div>

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
        <div class="field">
          <span>Endpoint</span>
          <div class="value">
            <code>{session.endpoint}</code><button
              onclick={() => copy('endpoint', session.endpoint)}
              >{copied === 'endpoint' ? 'Copied' : 'Copy'}</button
            >
          </div>
        </div>
      {/if}

      <div class="metrics">
        <div><b>{snapshot.clients}</b><span>Clients</span></div>
        <div><b>{snapshot.requestCount}</b><span>Requests</span></div>
        <div><b>{formatLastRequest()}</b><span>Last request</span></div>
      </div>
      <button
        class="toggle"
        disabled={!isOpenProject || busy}
        onclick={onToggle}
        >{state === 'stopped' || state === 'error'
          ? 'Publish MCP'
          : 'Stop MCP'}</button
      >
    </div>
  {/if}
</div>

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
  .connected {
    border-color: #63e6a0;
    background: #12633f;
  }
  .connected .dot {
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
  .count {
    min-width: 14px;
    padding: 0 3px;
    border-radius: 8px;
    text-align: center;
    background: #49d28b;
    color: #14251e;
    font-size: 10px;
  }
  .popover {
    position: absolute;
    z-index: 1;
    top: 100%;
    right: 0;
    width: 310px;
    padding: 14px;
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
  .eyebrow {
    color: #8993ad;
    font-size: 9px;
    letter-spacing: 0.12em;
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
    margin: 14px 0;
    color: #aeb6ca;
  }
  .state-line.connected {
    color: #65dda0;
  }
  .state-line.available {
    color: #69c2ff;
  }
  .state-line.error {
    color: #f48b94;
  }
  .field {
    margin: 10px 0;
    color: #929bb1;
    font-size: 10px;
  }
  .value {
    gap: 6px;
    margin-top: 4px;
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
  .metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    margin: 14px 0;
  }
  .metrics div {
    padding: 7px 4px;
    border-radius: 4px;
    text-align: center;
    background: #2a3144;
  }
  .metrics b,
  .metrics span {
    display: block;
  }
  .metrics b {
    color: #eef1f8;
    font-size: 12px;
  }
  .metrics span {
    margin-top: 3px;
    color: #929bb1;
    font-size: 9px;
  }
  .notice {
    padding: 8px;
    border: 1px solid #665d3e;
    border-radius: 4px;
    color: #f0d88a;
    background: #40391f;
    font-size: 11px;
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
