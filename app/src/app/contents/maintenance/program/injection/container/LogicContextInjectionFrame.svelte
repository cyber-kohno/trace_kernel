<script lang="ts">
  import { validationStore } from '../../../../../state/store';
  import WorkspaceState from '../../../../../state/model/workspace/workspace-state';
  import Record from '../../../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../../../util/layout/Wrap.svelte';
  import InjectionItem from './ContextInjectionItem.svelte';
  import ProgramInjectionUtil from '../program-injection-util';
  import { workspaceStore } from '../../../../../state/store';

  export let logicName = '';

  $: workspace = WorkspaceState.getWorkspace($workspaceStore);

  $: items = ProgramInjectionUtil.getLogicContextItems(
    workspace,
    $validationStore.disables,
    { excludeName: logicName },
  );
</script>

<Record surplus={364}>
  <Wrap margin={4} bgColor={'rgba(115, 115, 135, 0.4)'}>
    {#each items as item}
      <InjectionItem prefix={item.prefix} item={item.item} />
    {/each}
  </Wrap>
</Record>
