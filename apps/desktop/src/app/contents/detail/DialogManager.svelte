<script lang="ts">
  import { uiStore } from '../../state/store';
  import Record from '../../util/layout/RecordDiv.svelte';
  import DeclareDialog from './declare/DeclareDialog.svelte';
  import LogicDialog from './logic/ui/LogicDialog.svelte';
  import ProgramDialog from './program/ui/ProgramDialog.svelte';
  import SettingDialog from './setting/SettingDialog.svelte';
  import WorkProposalDialog from './WorkProposalDialog.svelte';

  $: dialog = $uiStore.dialog;
</script>

{#if dialog != undefined}
  <div class="blind">
    {#if dialog === 'program' || dialog === 'work-proposal'}
      <ProgramDialog
        visible={dialog === 'program'}
        editorId={$uiStore.workEditorId ?? ''}
      />
      {#if dialog === 'work-proposal'}
        <WorkProposalDialog />
      {/if}
    {:else if dialog === 'logic'}
      <LogicDialog />
    {:else if dialog === 'declare'}
      <DeclareDialog />
    {:else if dialog === 'setting'}
      <SettingDialog />
    {/if}
  </div>
{/if}

<style>
  .blind {
    display: inline-block;
    position: absolute;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 255, 255, 0.367);
    z-index: 5;
    left: 0;
    top: 0;
    backdrop-filter: blur(10px);
  }
</style>
