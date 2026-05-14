<script lang="ts">
  import workspaceStore from '../../../../../store/workspace-store';
  import workspaceValidationStore from '../../../../../store/workspace-validation-store';
  import StoreWorkspace from '../../../../../store/store-workspace';
  import Record from '../../../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../../../util/layout/Wrap.svelte';
  import InjectionItem from './ContextInjectionItem.svelte';
  import ProgramInjectionUtil from '../../../program/injection/program-injection-util';

  $: workspace = StoreWorkspace.getWorkspace($workspaceStore);

  $: items = ProgramInjectionUtil.getWorkContextItems(
    workspace,
    $workspaceValidationStore.disables,
  );
</script>

<Record surplus={364}>
  <Wrap margin={4} bgColor={'rgba(115, 115, 135, 0.4)'}>
    {#each items as item}
      <InjectionItem prefix={item.prefix} item={item.item} />
    {/each}
  </Wrap>
</Record>
