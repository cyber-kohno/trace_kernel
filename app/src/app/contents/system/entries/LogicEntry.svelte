<script lang="ts">
  import workspaceStore from '../../../store/workspace-store';
  import uiStore from '../../../store/ui-store';
  import StoreWorkspace from '../../../store/store-workspace';
  import EntryRecord from './EntryRecord.svelte';
  import workspaceValidationStore from '../../../store/workspace-validation-store';
  import ProgramInjectionUtil from '../../maintenance/program/injection/program-injection-util';

  export let index: number;

  $: workspace = StoreWorkspace.getWorkspace($workspaceStore);

  $: validate = () => {
    const target = StoreWorkspace.getTarget();
    StoreWorkspace.validate(target);
  };

  $: isFocus = (() => {
    const target = $uiStore.target;
    return target != null && target.cat === 'logic' && target.index === index;
  })();

  $: focus = () => {
    $uiStore.target = { cat: 'logic', index };
  };

  $: del = () => {
    workspace.logics.splice(index, 1);
    workspace.logics = workspace.logics.slice();
    $uiStore.target = null;
    $workspaceStore.workspace = { ...workspace };
    validate();
  };

  $: logic = workspace.logics[index];
  $: logicDisplay = ProgramInjectionUtil.getLogicDisplayItem(
    logic,
    workspace,
    $workspaceValidationStore.disables,
  );

  $: openLogic = () => {
    $uiStore.dialog = 'logic';
  };
</script>

<EntryRecord
  {focus}
  {isFocus}
  {del}
  contextmenu={openLogic}
  target={{ cat: 'logic', index }}
>
  <span>
    <span class="key">{logicDisplay}</span>
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
    color: rgb(255, 210, 133);
    font-style: italic;
  }
</style>
