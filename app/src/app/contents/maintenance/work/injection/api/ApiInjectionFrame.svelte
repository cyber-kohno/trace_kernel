<script lang="ts">
  import type WorkState from '../../../../../state/model/workspace/work-state';
  import Record from '../../../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../../../util/layout/Wrap.svelte';
  import DeclareUtil from '../../../../detail/program/util/declare-util';
  import ApiInjectionItem from './ApiInjectionItem.svelte';

  export let method: WorkState.OutputMethod;

  $: apis = DeclareUtil.getUsableReserveList({
    method,
  }).map((res) => {
    return `$${res}`;
  });
</script>

<Record height={170}>
  <Wrap margin={4} bgColor={'rgba(115, 115, 135, 0.4)'}>
    {#each apis as api}
      <ApiInjectionItem item={api} />
    {/each}
  </Wrap>
</Record>
