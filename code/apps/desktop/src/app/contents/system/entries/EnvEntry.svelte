<script lang="ts">
  import { uiStore } from '../../../state/store';
  import UiState from '../../../state/model/ui-state';
  import WorkspaceState from '../../../state/model/workspace/workspace-state';
  import EntryRecord from './EntryRecord.svelte';
  import ValidationService from '../../../service/validation-service';
  import { workspaceStore } from '../../../state/store';

  export let index: number;

  $: workspace = WorkspaceState.getWorkspace($workspaceStore);
  $: validate = () => {
    const target = UiState.getTarget($uiStore);
    ValidationService.validate(target);
  };

  $: isFocus = (() => {
    const target = $uiStore.target;
    return target != null && target.cat === 'env' && target.index === index;
  })();

  $: focus = () => {
    $uiStore.target = { cat: 'env', index };
  };

  $: del = () => {
    workspace.envs.splice(index, 1);
    workspace.envs = workspace.envs.slice();
    $uiStore.target = null;
    $workspaceStore.workspace = { ...workspace };
    validate();
  };

  $: envVar = workspace.envs[index];
</script>

<EntryRecord {focus} {isFocus} {del} target={{ cat: 'env', index }}>
  <span>
    <span>{'%'}</span>
    <span class="key">{envVar.varName}</span>
    <span>{'%: '}</span>
    <span class="value">{envVar.value}</span>
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
    color: rgb(255, 255, 151);
    font-style: italic;
  }
  .value {
    color: rgb(255, 255, 255);
  }
</style>
