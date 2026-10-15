<script lang="ts">
  import { appStore } from '../../state/store';
  import { CURRENT_GEN } from '../../gen/gen-version.js';
  import WorkspaceState from '../../state/model/workspace/workspace-state';
  import OperationButton from '../../util/button/OperationButton.svelte';
  import FileUtil from '../../util/data/file-util';
  import ValidationService from '../../service/validation-service';
  import { workspaceStore } from '../../state/store';

  const backToStart = () => {
    $appStore.apiWarning = null;
    $appStore = { ...$appStore };
  };

  const openWorkspace = async () => {
    if ($appStore.apiWarning == null) return;
    const warning = $appStore.apiWarning;
    const workspace = {
      ...warning.workspace,
      gen: {
        ...warning.workspace.gen,
        api: CURRENT_GEN.api,
      },
    };
    workspaceStore.update((state) => ({
      ...state,
      handlePath: warning.handlePath,
      workspace,
      snapshot: warning.snapshot,
    }));
    $appStore.apiWarning = null;
    $appStore = { ...$appStore };
    ValidationService.validateAll();
    await FileUtil.updateAppTitle();
  };
</script>

{#if $appStore.apiWarning != null}
  <div class="wrap">
    <div class="card">
      <div class="header">
        <div class="eyebrow">API Generation Warning</div>
        <h1>
          {`${$appStore.apiWarning.apiDiff.from} -> ${$appStore.apiWarning.apiDiff.to}`}
        </h1>
        <div class="path">{$appStore.apiWarning.handlePath}</div>
      </div>
      <div class="body">
        {@html $appStore.apiWarning.html}
      </div>
      <div class="actions">
        <OperationButton
          name={'Cancel'}
          callback={backToStart}
          isLineup={true}
          width={118}
        />
        <OperationButton
          name={'Open Workspace'}
          callback={openWorkspace}
          isLineup={true}
          width={218}
        />
      </div>
    </div>
  </div>
{/if}

<style>
  .wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 16px;
    width: calc(100% - 32px);
    height: calc(100% - 32px);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: min(960px, 100%);
    height: 100%;
    padding: 24px 28px;
    background-color: rgba(240, 248, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    box-sizing: border-box;
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .eyebrow {
    color: rgba(251, 116, 116, 0.538);
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: rgb(255, 255, 255);
    font-size: 30px;
    font-weight: 700;
    line-height: 1.2;
  }

  .path {
    color: rgba(255, 255, 255, 0.48);
    font-size: 13px;
    word-break: break-all;
  }

  .body {
    flex: 1;
    overflow: auto;
    padding: 20px 22px;
    background-color: rgba(14, 28, 38, 0.44);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.7;
  }

  .body :global(h1),
  .body :global(h2),
  .body :global(h3) {
    margin: 0 0 12px;
    color: rgb(255, 255, 255);
    line-height: 1.3;
  }

  .body :global(h1) {
    font-size: 28px;
  }

  .body :global(h2) {
    margin-top: 24px;
    font-size: 22px;
  }

  .body :global(h3) {
    margin-top: 20px;
    font-size: 18px;
  }

  .body :global(p) {
    margin: 0 0 12px;
  }

  .body :global(ul) {
    margin: 0 0 12px 20px;
    padding: 0;
  }

  .body :global(li) {
    margin: 0 0 6px;
  }

  .body :global(code) {
    padding: 1px 6px;
    background-color: rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    font-size: 0.95em;
  }

  .body :global(pre) {
    overflow: auto;
    margin: 16px 0;
    padding: 14px 16px;
    background-color: rgba(0, 0, 0, 0.28);
    border-radius: 10px;
  }

  .body :global(pre code) {
    padding: 0;
    background: transparent;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
</style>
