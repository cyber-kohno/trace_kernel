<script lang="ts">
  import { uiStore, workspaceStore } from '../../../state/store';
  import UiState from '../../../state/model/ui-state';
  import WorkspaceState from '../../../state/model/workspace/workspace-state';
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
    return (
      target != null && target.cat === 'resource' && target.index === index
    );
  })();

  $: focus = () => {
    $uiStore.target = { cat: 'resource', index };
  };

  $: del = () => {
    workspace.resources.splice(index, 1);
    workspace.resources = workspace.resources.slice();
    $uiStore.target = null;
    $workspaceStore.workspace = { ...workspace };
    validate();
  };

  $: resource = workspace.resources[index];
</script>

<EntryRecord {focus} {isFocus} {del} target={{ cat: 'resource', index }}>
  <span class="wrap">
    <span>{'$'}</span>
    <span class="name">{resource.varName}</span>
  </span>
</EntryRecord>

<style>
  .wrap {
    font-size: 0;
    * {
      font-size: 16px;
      font-weight: 400;
      color: rgba(255, 255, 255, 0.635);
    }
  }
  .name {
    color: rgb(119, 255, 92);
  }
</style>
