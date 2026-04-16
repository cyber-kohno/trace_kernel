<script lang="ts">
  import workspaceStore from '../../../store/workspace-store';
  import uiStore from '../../../store/ui-store';
  import StoreProject from '../../../store/store-workspace';
  import EntryRecord from './EntryRecord.svelte';

  export let index: number;

  $: workspace = StoreProject.getWorkspace($workspaceStore);
  $: validate = () => {
    const target = StoreProject.getTarget();
    StoreProject.validate(target);
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
