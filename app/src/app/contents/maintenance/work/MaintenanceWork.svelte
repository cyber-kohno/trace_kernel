<script lang="ts">
  import TextInput from '../../../util/form/TextInput.svelte';
  import LabelRecord from '../../../util/item/LabelRecord.svelte';
  import Record from '../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../util/layout/Wrap.svelte';
  import WorkspaceState from '../../../state/model/workspace/workspace-state';
  import { uiStore, workspaceStore } from '../../../state/store';
  import OperationButton from '../../../util/button/OperationButton.svelte';
  import OperationSwitch from '../../../util/button/OperationSwitch.svelte';
  import type WorkState from '../../../state/model/workspace/work-state';
  import ContextInjectionFrame from './injection/container/ContextInjectionFrame.svelte';
  import ApiInjectionFrame from './injection/api/ApiInjectionFrame.svelte';
  import { commitWorkspace, getTargetEntry } from '../maintenance-helpers';
  import ValidationService from '../../../service/validation-service';

  $: workspace = WorkspaceState.getWorkspace($workspaceStore);

  $: hasDisable = (() => {
    const target = $uiStore.target;
    if (target != null) {
      return ValidationService.hasDisable(target);
    }
    return false;
  })();

  $: work = getTargetEntry($uiStore.target, 'work', workspace.works);

  $: setName = (v: string) => {
    work.name = v;
    commitWorkspace(workspace);
  };

  $: setMethod = (method: WorkState.OutputMethod) => {
    work.method = method;
    commitWorkspace(workspace, { validate: false });
  };

  $: openProgram = () => {
    $uiStore.dialog = 'program';
  };
</script>

<Wrap>
  <Record surplus={30}>
    <LabelRecord name={'name'} />
    <TextInput
      value={work.name}
      set={setName}
      width={'calc(100% - 4px)'}
      required
    />
    <LabelRecord name={'output_method'} />
    <Record>
      <OperationSwitch
        name="Plain"
        callback={() => setMethod('plain')}
        isActive={work.method === 'plain'}
      />
      <OperationSwitch
        name="Channel"
        callback={() => setMethod('channel')}
        isActive={work.method === 'channel'}
      />
    </Record>
    <!-- <LabelRecord name={"utilities"} /> -->
    <!-- 予約関数の使用方法表示 -->
    <!-- <UsageFrame method={work.method} />  -->
    <LabelRecord name={'api_injections'} />
    <ApiInjectionFrame method={work.method} />
    <LabelRecord name={'context_injections'} />
    <!-- 予約関数の使用方法表示 -->
    <ContextInjectionFrame />
  </Record>
  <Record align="right">
    <OperationButton
      name={'Open Editor'}
      callback={openProgram}
      isDisable={hasDisable}
      isLineup
      width={150}
    />
  </Record>
</Wrap>
