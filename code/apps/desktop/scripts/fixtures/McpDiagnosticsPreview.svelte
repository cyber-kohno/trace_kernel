<script lang="ts">
  import McpSessionBadge from '../../src/app/mcp/McpSessionBadge.svelte';
  import {
    emptyDiagnostics,
    diagnosticState,
  } from '../../src/app/mcp/mcp-diagnostics';
  import { PRODUCT_INFO } from '../../src/app/product-info';
  import type { McpDiagnostics } from '../../src/app/mcp/mcp-session-types';

  let scenario = 'stopped';
  let diagnostics: McpDiagnostics = emptyDiagnostics();
  let externalDialog = false;
  let projectOpen = true;
  let revision = 0;
  const makeSession = () => ({
    sessionId: `00000000-0000-4000-8000-${String(revision).padStart(12, '0')}`,
    endpoint: 'http://127.0.0.1:12345',
  });
  $: {
    // Each fixture selection is isolated from the user's actual Desktop state.
    revision;
    diagnostics =
      scenario === 'stopped'
        ? emptyDiagnostics()
        : {
            ...emptyDiagnostics(),
            session: makeSession(),
            published: scenario !== 'cleanup',
            acceptedRequests:
              scenario === 'verified' || scenario === 'rejections' ? 30 : 0,
            lastAcceptedAt:
              scenario === 'verified' || scenario === 'rejections'
                ? 123456789
                : null,
            lastPeerGeneration:
              scenario === 'verified' || scenario === 'rejections'
                ? PRODUCT_INFO.bridgeProtocolGen
                : null,
            rejectedRequests: scenario === 'rejections' ? 16 : 0,
            rejections:
              scenario === 'rejections'
                ? Array.from({ length: 8 }, (_, index) => ({
                    code:
                      index === 0
                        ? 'MCP_CONTRACT_REQUIRED'
                        : 'MCP_BRIDGE_GENERATION_MISMATCH',
                    expectedGeneration: PRODUCT_INFO.bridgeProtocolGen,
                    actualGeneration:
                      index === 0
                        ? null
                        : PRODUCT_INFO.bridgeProtocolGen + index,
                    firstSeenAt: 123456789,
                    lastSeenAt: 123456789,
                    count: 2,
                  }))
                : [],
          };
  }
  const toggle = () => {
    revision++;
    scenario = diagnostics.session ? 'stopped' : 'published';
  };
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'F6') {
      event.preventDefault();
      diagnostics = {
        ...diagnostics,
        rejections: [...diagnostics.rejections].reverse(),
      };
    } else if (event.key === 'F7') {
      event.preventDefault();
      revision++;
    } else if (event.key === 'F8') {
      event.preventDefault();
      externalDialog = true;
    } else if (event.key === 'F9') {
      event.preventDefault();
      projectOpen = false;
    }
  }}
/>

<div class="menu">
  <McpSessionBadge
    isOpenProject={projectOpen}
    state={scenario === 'error' ? 'error' : diagnosticState(diagnostics)}
    session={diagnostics.session}
    {diagnostics}
    diagnosticError={scenario === 'error'
      ? 'MCP status is unavailable. Publication and communication cannot be confirmed.'
      : ''}
    onToggle={toggle}
    dialogOpen={externalDialog}
  />
</div>
<main>
  <p>
    UI fixture only — no real Desktop session or Workspace. F6: reorder; F7: new
    session; F8: other dialog; F9: close project.
  </p>
  <label
    >Scenario <select bind:value={scenario}>
      <option value="stopped">OFF</option>
      <option value="published">Published</option>
      <option value="verified">Verified</option>
      <option value="rejections">8 rejection groups</option>
      <option value="error">Diagnostic error</option>
      <option value="cleanup">Cleanup pending</option>
    </select></label
  >
  <button
    onclick={() => {
      diagnostics = {
        ...diagnostics,
        rejections: [...diagnostics.rejections].reverse(),
      };
    }}>Reorder history</button
  >
  <button
    onclick={() => {
      revision++;
    }}>New session</button
  >
  <label
    ><input type="checkbox" bind:checked={externalDialog} />Other dialog open</label
  >
  <label><input type="checkbox" bind:checked={projectOpen} />Project open</label
  >
</main>

<style>
  .menu {
    display: flex;
    align-items: center;
    padding: 0 8px;
    height: 30px;
    background: #334;
  }
  main {
    margin: 220px 12px 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  main p {
    flex-basis: 100%;
  }
  button,
  select {
    font: inherit;
  }
</style>
