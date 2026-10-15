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
    return target != null && target.cat === 'process' && target.index === index;
  })();

  $: focus = () => {
    $uiStore.target = { cat: 'process', index };
  };

  $: del = () => {
    workspace.processes.splice(index, 1);
    workspace.processes = workspace.processes.slice();
    $uiStore.target = null;
    $workspaceStore.workspace = { ...workspace };
    validate();
  };

  $: process = workspace.processes[index];
  $: prgPath = process.prgPath.split('\\').slice(-3).join('\\');
</script>

<EntryRecord {focus} {isFocus} {del} target={{ cat: 'process', index }}>
  <span>
    <span>{'%'}</span>
    <span class="key">{process.funcName}</span>
    <span>{'%: '}</span>
    <span class="command">{prgPath}</span>
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
  .command {
    color: rgb(255, 255, 255);
  }
</style>
