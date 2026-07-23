<script lang="ts">
  import TextInput from '../../util/form/TextInput.svelte';
  import LabelRecord from '../../util/item/LabelRecord.svelte';
  import Wrap from '../../util/layout/Wrap.svelte';
  import WorkspaceState from '../../state/model/workspace/workspace-state';
  import { uiStore, workspaceStore } from '../../state/store';
  import UiState from '../../state/model/ui-state';
  import { commitWorkspace, getTargetEntry } from './maintenance-helpers';

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
</script>

<Wrap>
  <div class="main">
    <LabelRecord name={'name'} />
    <TextInput
      value={logic.name}
      set={setName}
      width={'calc(100% - 4px)'}
      required
    />
  </div>
</Wrap>
