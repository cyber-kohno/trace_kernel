<script lang="ts">
  import Record from '../../../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../../../util/layout/Wrap.svelte';
  import ApiInjectionItem from './ApiInjectionItem.svelte';
  import ProgramInjectionUtil from '../program-injection-util';

  $: apis = ProgramInjectionUtil.getLogicApiItems();
</script>

<Record height={170}>
  <Wrap margin={4} bgColor={'rgba(115, 115, 135, 0.4)'}>
    {#each apis as api}
      <ApiInjectionItem item={api} />
    {/each}
  </Wrap>
</Record>
