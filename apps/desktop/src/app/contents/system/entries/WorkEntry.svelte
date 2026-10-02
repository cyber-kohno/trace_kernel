<script lang="ts">
  import { uiStore, workspaceStore } from '../../../state/store';
  import UiState from '../../../state/model/ui-state';
  import WorkspaceState from '../../../state/model/workspace/workspace-state';
  import ToastService from '../../../service/toast-service';
  import EntryRecord from './EntryRecord.svelte';
  import ValidationService from '../../../service/validation-service';

  export let index: number;

  $: workspace = WorkspaceState.getWorkspace($workspaceStore);

  $: validate = () => {
    const target = UiState.getTarget($uiStore);
    ValidationService.validate(target);
  };

  $: isFocus = (() => {
    const target = $uiStore.target;
    return target != null && target.cat === 'work' && target.index === index;
  })();

  $: focus = () => {
    $uiStore.target = { cat: 'work', index };
  };

  $: del = () => {
    workspace.works.splice(index, 1);
    workspace.works = workspace.works.slice();
    $uiStore.target = null;
    $workspaceStore.workspace = { ...workspace };
    validate();
  };

  $: works = workspace.works[index];

  $: openProgram = () => {
    const target = UiState.getTarget($uiStore);
    const hasDisable = ValidationService.hasDisable(target);
    if (hasDisable)
      ToastService.show({ text: 'This work has an error and cannot be opened.' });
    else $uiStore.dialog = 'program';
  };
</script>

<EntryRecord
  {focus}
  {isFocus}
  {del}
  contextmenu={openProgram}
  target={{ cat: 'work', index }}
>
  <span>
    <span class="key">{works.name}</span>
    {#if works.origin === 'ai'}<span class="ai-badge">AI</span>{/if}
  </span>
</EntryRecord>

<style>
  span {
    font-size: 0;
    * {
      font-size: 16px;
      font-weight: 400;
      color: rgba(255, 255, 255, 0.635);
    }
  }
  .key {
    color: rgb(238, 139, 255);
    font-style: italic;
  }
  .ai-badge { margin-left: 6px; padding: 1px 4px; border: 1px solid #63e6a0; border-radius: 4px; color: #8affbd; background: #12633f; font-size: 10px !important; font-style: normal; }
</style>
