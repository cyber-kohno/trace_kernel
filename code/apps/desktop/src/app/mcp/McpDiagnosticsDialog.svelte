<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    McpDiagnostics,
    McpSessionInfo,
    McpSessionState,
  } from './mcp-session-types';
  import {
    rejectionExplanation,
    rejectionIndex,
    rejectionKey,
  } from './mcp-diagnostics';
  import { PRODUCT_INFO } from '../product-info';

  export let diagnostics: McpDiagnostics;
  export let session: McpSessionInfo | null;
  export let state: McpSessionState;
  export let diagnosticError = '';
  export let onClose: () => void;

  let modal: HTMLDialogElement;
  let view: 'overview' | 'rejections' | 'help' = 'overview';
  let selectedKey = '';
  let previousSessionId = session?.sessionId;
  let copied = '';
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let copyFailed = false;
  let disposed = false;

  $: {
    if (session?.sessionId !== previousSessionId) {
      previousSessionId = session?.sessionId;
      selectedKey = '';
      copied = '';
      copyFailed = false;
    }
    if (!selectedKey && diagnostics.rejections[0]) {
      selectedKey = rejectionKey(diagnostics.rejections[0]);
    }
  }
  $: page = rejectionIndex(diagnostics.rejections, selectedKey);
  $: rejection = diagnostics.rejections[page];

  onMount(() => {
    // A native modal uses the top layer and provides focus containment and Escape.
    // It is independent of the small popover's position and stacking context.
    modal.showModal();
    return () => {
      disposed = true;
      clearTimeout(copyTimer);
      modal.close();
    };
  });

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
  const formatTime = (timestamp: number | null) =>
    timestamp == null ? 'Never' : new Date(timestamp).toLocaleTimeString();
  const navigate = (step: number) => {
    const next = diagnostics.rejections[page + step];
    if (next) selectedKey = rejectionKey(next);
  };
  const cancel = (event: Event) => {
    event.preventDefault();
    onClose();
  };
</script>

<dialog
  bind:this={modal}
  aria-labelledby="mcp-diagnostics-title"
  oncancel={cancel}
>
  <div class="layout">
    <header>
      <strong id="mcp-diagnostics-title">MCP diagnostics</strong>
      <button class="close" aria-label="Close diagnostics" onclick={onClose}
        >×</button
      >
    </header>
    <nav aria-label="Diagnostic views">
      <button
        aria-pressed={view === 'overview'}
        onclick={() => (view = 'overview')}>Overview</button
      >
      <button
        aria-label="Compatibility rejects ({diagnostics.rejectedRequests})"
        aria-pressed={view === 'rejections'}
        onclick={() => (view = 'rejections')}
        >Rejections ({diagnostics.rejectedRequests})</button
      >
      <button aria-pressed={view === 'help'} onclick={() => (view = 'help')}
        >Help</button
      >
    </nav>
    <div class="content">
      {#if view === 'overview'}
        <div class="summary">
          <b>MCP gen: {PRODUCT_INFO.bridgeProtocolGen}</b>
        </div>
        {#if diagnosticError}
          <p class="notice" role="status">{diagnosticError}</p>
        {:else if diagnostics.session && !diagnostics.published}
          <p class="notice">
            The bridge is no longer published. Retry Stop MCP to finish cleanup.
          </p>
        {:else if state === 'starting' || state === 'stopping'}
          <p>MCP is {state}.</p>
        {:else if diagnostics.published}
          {#if diagnostics.lastAcceptedAt != null}
            <p>
              Compatible request received from MCP gen {diagnostics.lastPeerGeneration}
              (history).
            </p>
          {:else}
            <p>Ready to receive requests; none accepted yet.</p>
          {/if}
        {:else}
          <p>MCP is not published.</p>
        {/if}
        {#if session}
          <dl class="connection">
            <div>
              <dt>Session ID</dt>
              <dd>
                <code>{session.sessionId}</code><button
                  onclick={() => copy('session', session.sessionId)}
                  >{copied === 'session' ? 'Copied' : 'Copy'}</button
                >
              </dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd>
                <code>{session.endpoint}</code><button
                  onclick={() => copy('endpoint', session.endpoint)}
                  >{copied === 'endpoint' ? 'Copied' : 'Copy'}</button
                >
              </dd>
            </div>
          </dl>
        {/if}
        {#if copyFailed}<p class="notice" role="status">
            Copy failed. Select and copy the value manually.
          </p>{/if}
        <dl class="metrics">
          <div>
            <dt>Accepted</dt>
            <dd>{diagnostics.acceptedRequests}</dd>
          </div>
          <div>
            <dt>Compatibility rejects</dt>
            <dd>{diagnostics.rejectedRequests}</dd>
          </div>
          <div>
            <dt>Last compatible request</dt>
            <dd>{formatTime(diagnostics.lastAcceptedAt)}</dd>
          </div>
        </dl>
      {:else if view === 'rejections'}
        {#if rejection}
          <article aria-label="Selected compatibility rejection">
            <div class="rejection-heading">
              <code>{rejection.code}</code><b>×{rejection.count}</b>
            </div>
            <p>
              Desktop MCP gen {rejection.expectedGeneration} / Requester MCP gen {rejection.actualGeneration ??
                'Unknown'}
            </p>
            <p>{rejectionExplanation(rejection.code).reason}</p>
            <p>{rejectionExplanation(rejection.code).action}</p>
            <small>Last seen: {formatTime(rejection.lastSeenAt)}</small>
          </article>
        {:else}
          <p>No compatibility rejections observed.</p>
        {/if}
      {:else}
        <p>Only the MCP generation must match. Product versions may differ.</p>
        <p>
          Published means requests can be received, not that a client is
          connected. Verified request is historical confirmation, not a
          persistent connection.
        </p>
        <p>
          Desktop-observed requests only. Preflight failures reported only by
          the MCP adapter do not appear here.
        </p>
        <p>
          Repeated rejections are grouped; only the latest 8 groups are retained
          for this session. Other compatible clients can continue using the
          bridge.
        </p>
        <p>
          After updating an MCP adapter, restart its process in your AI client.
          Desktop does not restart external processes or change their settings.
        </p>
      {/if}
    </div>
    {#if view === 'rejections' && diagnostics.rejections.length > 0}
      <footer aria-label="Rejection history pages">
        <button disabled={page === 0} onclick={() => navigate(-1)}
          >Previous</button
        >
        <span aria-live="polite"
          >{page + 1} / {diagnostics.rejections.length}</span
        >
        <button
          disabled={page >= diagnostics.rejections.length - 1}
          onclick={() => navigate(1)}>Next</button
        >
      </footer>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    position: fixed;
    inset: 16px 0 auto;
    margin: 0 auto;
    width: min(540px, calc(100vw - 24px));
    max-width: none;
    max-height: calc(100dvh - 24px);
    padding: 0;
    border: 1px solid #56617d;
    border-radius: 8px;
    color: #e8ebf5;
    background: #202536;
    box-shadow: 0 8px 24px #0008;
    font:
      12px system-ui,
      sans-serif;
    box-sizing: border-box;
    overflow: hidden;
  }
  dialog::backdrop {
    background: #0008;
  }
  .layout {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 26px);
  }
  header,
  nav,
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    flex-shrink: 0;
  }
  header {
    justify-content: space-between;
  }
  nav {
    padding-top: 0;
    border-bottom: 1px solid #56617d;
    flex-wrap: wrap;
  }
  nav button[aria-pressed='true'] {
    border-color: #a8caff;
    color: #e8ebf5;
    background: #384764;
  }
  .content {
    padding: 12px 14px;
    min-height: 0;
    overflow-y: auto;
    overflow-wrap: anywhere;
  }
  p {
    margin: 8px 0;
    line-height: 1.5;
  }
  .summary {
    margin-bottom: 8px;
  }
  button {
    border: 1px solid #59647e;
    border-radius: 4px;
    color: #cbd3e5;
    background: #303950;
    padding: 4px 8px;
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .close {
    border: 0;
    padding: 0 4px;
    background: transparent;
    font-size: 20px;
  }
  .connection {
    margin: 12px 0;
  }
  .connection > div {
    margin: 8px 0;
  }
  dt {
    color: #aeb6ca;
    font-size: 11px;
  }
  dd {
    margin: 3px 0 0;
  }
  .connection dd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  code {
    user-select: text;
  }
  .connection button {
    flex-shrink: 0;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 12px 0;
  }
  .metrics > div {
    padding: 8px;
    background: #2a3144;
    border-radius: 4px;
  }
  .notice,
  article {
    padding: 10px;
    border: 1px solid #75613b;
    border-radius: 4px;
    color: #ead39d;
  }
  .rejection-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .rejection-heading b {
    flex-shrink: 0;
  }
  footer {
    justify-content: space-between;
    border-top: 1px solid #56617d;
  }
  @media (max-width: 400px) {
    .metrics {
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .metrics > div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 8px;
    }
    .metrics dd {
      margin: 0;
    }
  }
</style>
