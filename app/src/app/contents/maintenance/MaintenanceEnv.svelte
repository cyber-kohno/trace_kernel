<script lang="ts">
  import TextInput from '../../util/form/TextInput.svelte';
  import LabelRecord from '../../util/item/LabelRecord.svelte';
  import Record from '../../util/layout/RecordDiv.svelte';
  import Wrap from '../../util/layout/Wrap.svelte';
  import workspaceState from '../../state/model/workspace/workspace-state';
  import { uiStore, workspaceStore } from '../../state/store';
  import UiState from '../../state/model/ui-state';
  import EnvState from '../../state/model/workspace/env-state';
  import OperationSwitch from '../../util/button/OperationSwitch.svelte';
  import PathState from '../../util/form/validation/PathState.svelte';
  import ValidateUtil from '../../util/data/validate-util';
  import { commitWorkspace, getTargetEntry } from './maintenance-helpers';

  $: workspace = workspaceState.getWorkspace($workspaceStore);

  $: env = getTargetEntry(UiState.getTarget($uiStore), 'env', workspace.envs);

  $: setKey = (v: string) => {
    env.varName = v;
    commitWorkspace(workspace);
  };
  $: setValue = (v: string) => {
    env.value = v;
    commitWorkspace(workspace);
  };

  $: getTogglePurposeCallback = (purpose: EnvState.Purpose) => {
    return () => {
      if (env.purpose === purpose) {
        delete env.purpose;
      } else {
        env.purpose = purpose;
      }
      commitWorkspace(workspace, { validate: false });
    };
  };
</script>

<Wrap>
  <div class="main">
    <LabelRecord name={'name'} sub={'uppercase only'} />
    <TextInput
      value={env.varName}
      set={setKey}
      width={'calc(100% - 4px)'}
      requied
      allowedPattern={ValidateUtil.UpperCase}
    />
    <LabelRecord name={'purpose'} />
    <Record>
      <OperationSwitch
        name="Directory path"
        callback={getTogglePurposeCallback('dir')}
        isActive={env.purpose === 'dir'}
      />
      <OperationSwitch
        name="File path"
        callback={getTogglePurposeCallback('file')}
        isActive={env.purpose === 'file'}
      />
    </Record>
    <LabelRecord name={'value'} />
    <TextInput
      value={env.value}
      set={setValue}
      width={'calc(100% - 4px)'}
      requied
    />
    {#if env.purpose === 'dir'}
      <PathState isDir={true} path={env.value} />
    {/if}
    {#if env.purpose === 'file'}
      <PathState isDir={false} path={env.value} />
    {/if}
  </div>
</Wrap>
