<script lang="ts">
  import TextInput from '../../util/form/TextInput.svelte';
  import LabelRecord from '../../util/item/LabelRecord.svelte';
  import Wrap from '../../util/layout/Wrap.svelte';
  import StoreWorkspace from '../../store/store-workspace';
  import workspaceStore from '../../store/workspace-store';
  import { commitWorkspace, getTargetEntry } from './maintenance-helpers';

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
</script>

<Wrap>
  <div class="main">
    <LabelRecord name={'name'} />
    <TextInput
      value={logic.name}
      set={setName}
      width={'calc(100% - 4px)'}
      requied
    />
  </div>
</Wrap>
