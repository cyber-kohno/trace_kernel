<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import MonacoFactory from '../../util/monaco/monaco-factory';
  import {
    resolveWorkUpdateProposal,
    workUpdateProposalStore,
  } from '../../mcp/work-update-proposal';

  $: proposal = $workUpdateProposalStore;
  let diffRoot: HTMLDivElement;
  let diffEditor: any;
  let originalModel: any;
  let modifiedModel: any;
  let loadError = '';
  let diffReady = false;
  let decisionSent = false;
  let disposed = false;

  onMount(async () => {
    try {
      const monaco = await MonacoFactory.createMonaco();
      if (disposed || !proposal || !diffRoot) return;
      originalModel = monaco.editor.createModel(
        proposal.baselineSource,
        'typescript',
      );
      modifiedModel = monaco.editor.createModel(
        proposal.proposedSource,
        'typescript',
      );
      diffEditor = monaco.editor.createDiffEditor(diffRoot, {
        automaticLayout: true,
        readOnly: true,
        originalEditable: false,
        renderSideBySide: true,
        ignoreTrimWhitespace: false,
        wordWrap: 'off',
        theme: 'vs-dark',
      });
      diffEditor.setModel({ original: originalModel, modified: modifiedModel });
      diffReady = true;
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
    }
  });

  onDestroy(() => {
    disposed = true;
    diffEditor?.dispose();
    originalModel?.dispose();
    modifiedModel?.dispose();
  });

  const decide = (decision: 'apply' | 'reject') => {
    const current = get(workUpdateProposalStore);
    if (!current || decisionSent) return;
    decisionSent = true;
    resolveWorkUpdateProposal(current.proposalId, decision);
  };
</script>

{#if proposal}
  <section class="proposal" aria-modal="true" role="dialog">
    <header>
      <div class="title">Work source proposal</div>
      <div class="subtitle">{proposal.name}</div>
    </header>
    <div
      bind:this={diffRoot}
      class="diff"
      aria-label="Monaco source diff"
    ></div>
    {#if loadError}
      <div class="error">Could not load the diff editor: {loadError}</div>
    {/if}
    <footer>
      <button
        class="reject"
        disabled={decisionSent}
        onclick={() => decide('reject')}>Reject</button
      >
      <button
        class="apply"
        disabled={decisionSent || !diffReady}
        onclick={() => decide('apply')}>Apply all</button
      >
    </footer>
  </section>
{/if}

<style>
  .proposal {
    position: absolute;
    z-index: 2;
    inset: 16px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 18px;
    color: #e6edf3;
    background: #17191d;
    border: 1px solid #59616b;
    border-radius: 8px;
    box-shadow: 0 12px 40px #0009;
  }

  header {
    padding-bottom: 12px;
    border-bottom: 1px solid #3b4149;
  }

  .title {
    font-size: 18px;
    font-weight: 600;
  }

  .subtitle {
    margin-top: 4px;
    color: #a9b1bb;
  }

  .diff {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    margin: 12px 0;
    border: 1px solid #353b43;
  }

  .error {
    padding: 8px;
    color: #ffaaaa;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid #3b4149;
  }

  button {
    min-width: 110px;
    padding: 8px 14px;
    color: inherit;
    border: 1px solid #59616b;
    border-radius: 4px;
    background: #282d34;
    cursor: pointer;
  }

  button.apply {
    color: #101712;
    border-color: #68d391;
    background: #68d391;
  }

  button:hover {
    filter: brightness(1.1);
  }

  button:disabled {
    opacity: 0.55;
    cursor: wait;
  }
</style>
