<script lang="ts">
  import TextInput from '../../../util/form/TextInput.svelte';
  import LabelRecord from '../../../util/item/LabelRecord.svelte';
  import Record from '../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../util/layout/Wrap.svelte';
  import StoreWorkspace from '../../../store/store-workspace';
  import workspaceStore from '../../../store/workspace-store';
  import uiStore from '../../../store/ui-store';
  import OperationButton from '../../../util/button/OperationButton.svelte';
  import { commitWorkspace, getTargetEntry } from '../maintenance-helpers';
  import LogicContextInjectionFrame from './injection/container/LogicContextInjectionFrame.svelte';
  import LogicApiInjectionFrame from './injection/api/LogicApiInjectionFrame.svelte';

  $: workspace = StoreWorkspace.getWorkspace($workspaceStore);

  $: logic = getTargetEntry(
    StoreWorkspace.getTarget(),
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
      requied
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
