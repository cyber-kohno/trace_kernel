<script lang="ts">
  import { tick } from 'svelte';
  import { appStore } from '../../state/store';
  import OperationButton from '../../util/button/OperationButton.svelte';
  import MigrationFlow from '../../gen/migration-flow';

  const backToStart = () => {
    if ($appStore.migration?.status === 'running') return;
    MigrationFlow.clear();
  };

  const migrate = async () => {
    const state = $appStore.migration;
    if (state == null || state.status !== 'idle') return;
    const runningState: MigrationFlow.State = {
      ...state,
      status: 'running',
      errorMessage: null,
    };
    $appStore.migration = runningState;
    $appStore = { ...$appStore };
    await tick();

    try {
      const nextState = await MigrationFlow.start(runningState);
      $appStore.migration = nextState;
      $appStore = { ...$appStore };
    } catch (e) {
      $appStore.migration = {
        ...runningState,
        status: 'failed',
        errorMessage:
          e instanceof Error ? e.message : 'Workspace migration failed.',
      };
      $appStore = { ...$appStore };
    }
  };

  const openWorkspace = async () => {
    const state = $appStore.migration;
    if (state?.status !== 'succeeded' || state.migrated == null) return;
    await MigrationFlow.open(state);
  };
</script>

{#if $appStore.migration != null}
  <div class="wrap">
    <div class="card">
      <div class="header">
        <div class="eyebrow">Workspace Migration</div>
        <h1>
          {$appStore.migration.diff.from}
          {' -> '}
          {$appStore.migration.diff.to}
        </h1>
        <div class="path">{$appStore.migration.handlePath}</div>
      </div>
      <div class="body">
        <p>
          This workspace was created with an older workspace generation and must
          be migrated before it can be used in the current app.
        </p>
        <p>
          The migrated workspace will open as a new unsaved workspace. Your
          original file will remain unchanged.
        </p>

        <div class="status">
          <div class="label">Status</div>
          <div class="value" data-status={$appStore.migration.status}>
            {$appStore.migration.status}
          </div>
        </div>

        {#if $appStore.migration.status === 'idle'}
          <p class="note">
            Press <code>Migrate</code> to run the workspace migration.
          </p>
        {:else if $appStore.migration.status === 'running'}
          <p class="note">Migration is running.</p>
        {:else if $appStore.migration.status === 'succeeded'}
          <p class="note">
            Migration completed successfully. Press
            <code>Open Workspace</code> to continue.
          </p>
        {:else if $appStore.migration.errorMessage != null}
          <p class="error">
            {$appStore.migration.errorMessage}
          </p>
        {/if}
      </div>
      <div class="actions">
        <OperationButton
          name={'Back'}
          callback={backToStart}
          isLineup={true}
          width={118}
          isDisable={$appStore.migration.status === 'running'}
        />
        <OperationButton
          name={'Migrate'}
          callback={migrate}
          isLineup={true}
          width={118}
          isDisable={$appStore.migration.status !== 'idle'}
        />
        <OperationButton
          name={'Open Workspace'}
          callback={openWorkspace}
          isLineup={true}
          width={218}
          isDisable={$appStore.migration.status !== 'succeeded'}
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
    color: rgba(255, 211, 130, 0.72);
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

  .body p {
    margin: 0 0 12px;
  }

  .body code {
    padding: 1px 6px;
    background-color: rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    font-size: 0.95em;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 18px 0 12px;
    padding: 12px 14px;
    background-color: rgba(255, 255, 255, 0.04);
    border-radius: 10px;
  }

  .label {
    color: rgba(255, 255, 255, 0.58);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .value {
    font-size: 18px;
    font-weight: 700;
    text-transform: capitalize;
  }

  .value[data-status='idle'] {
    color: rgba(255, 255, 255, 0.9);
  }

  .value[data-status='running'] {
    color: rgba(255, 220, 140, 0.9);
  }

  .value[data-status='succeeded'] {
    color: rgba(163, 255, 191, 0.95);
  }

  .value[data-status='failed'] {
    color: rgba(255, 145, 145, 0.95);
  }

  .note {
    color: rgba(255, 255, 255, 0.76);
  }

  .error {
    color: rgba(255, 145, 145, 0.95);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
</style>
