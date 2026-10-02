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
    return target != null && target.cat === 'dataset' && target.index === index;
  })();

  $: focus = () => {
    $uiStore.target = { cat: 'dataset', index };
  };

  $: del = () => {
    workspace.datasets.splice(index, 1);
    workspace.datasets = workspace.datasets.slice();
    $uiStore.target = null;
    $workspaceStore.workspace = { ...workspace };
    validate();
  };

  $: dataSets = workspace.datasets[index];

  $: rootPath = dataSets.rootPath.split('\\').slice(-3).join('\\');
</script>

<EntryRecord {focus} {isFocus} {del} target={{ cat: 'dataset', index }}>
  <span>
    <span>{'$'}</span>
    <span class="name">{dataSets.varName}</span>
    <span>&nbsp;{'['}</span>
    <span class="method">
      {dataSets.scanOption == undefined ? 'all' : 'choice'}
    </span>
    <span>{'] '}</span>
    <span class="root">{rootPath}</span>
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
  .method {
    color: rgb(255, 175, 70);
    font-style: italic;
  }
  .name {
    color: rgb(119, 255, 92);
  }
  .root {
    color: rgb(255, 255, 255);
  }
</style>
