<script lang="ts">
  import TextInput from '../../../util/form/TextInput.svelte';
  import LabelRecord from '../../../util/item/LabelRecord.svelte';
  import Record from '../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../util/layout/Wrap.svelte';
  import WorkspaceState from '../../../state/model/workspace/workspace-state';
  import { uiStore } from '../../../state/store';
  import UiState from '../../../state/model/ui-state';
  import OperationButton from '../../../util/button/OperationButton.svelte';
  import { commitWorkspace, getTargetEntry } from '../maintenance-helpers';
  import LogicContextInjectionFrame from './injection/container/LogicContextInjectionFrame.svelte';
  import LogicApiInjectionFrame from './injection/api/LogicApiInjectionFrame.svelte';
  import { workspaceStore } from '../../../state/store';

  $: workspace = WorkspaceState.getWorkspace($workspaceStore);

  $: logic = getTargetEntry(
    UiState.getTarget($uiStore),
    'logic',
    workspace.logics,
  );

  $: setName = (v: string) => {
    logic.name = v;
    commitWorkspace(workspace);
  };

  $: openProgram = () => {
    $uiStore.dialog = 'logic';
  };
</script>

<Wrap>
  <Record surplus={30}>
    <LabelRecord name={'name'} />
    <TextInput
      value={logic.name}
      set={setName}
      width={'calc(100% - 4px)'}
      required
    />
    <LabelRecord name={'api_injections'} />
    <LogicApiInjectionFrame />
    <LabelRecord name={'context_injections'} />
    <LogicContextInjectionFrame logicName={logic.name} />
  </Record>
  <Record align="right">
    <OperationButton
      name={'Open Editor'}
      callback={openProgram}
      isLineup
      width={150}
    />
  </Record>
</Wrap>
