<script lang="ts">
  import type StoreWork from '../../../../../store/store-work';
  import Record from '../../../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../../../util/layout/Wrap.svelte';
  import DeclareUtil from '../../../../detail/program/util/declare-util';
  import ApiInjectionItem from './ApiInjectionItem.svelte';

  export let method: StoreWork.OutputMethod;

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
