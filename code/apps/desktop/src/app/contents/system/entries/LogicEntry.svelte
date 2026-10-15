<script lang="ts">
  import { uiStore, workspaceStore } from '../../../state/store';
  import UiState from '../../../state/model/ui-state';
  import WorkspaceState from '../../../state/model/workspace/workspace-state';
  import EntryRecord from './EntryRecord.svelte';
  import { validationStore } from '../../../state/store';
  import ProgramInjectionUtil from '../../maintenance/program/injection/program-injection-util';
  import ValidationService from '../../../service/validation-service';

  export let index: number;

  $: workspace = WorkspaceState.getWorkspace($workspaceStore);

  $: validate = () => {
    const target = UiState.getTarget($uiStore);
    ValidationService.validate(target);
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
    $validationStore.disables,
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
