<script lang="ts">
  import type StoreWork from "../../../../store/StoreWork";
  import Record from "../../../../util/layout/RecordDiv.svelte";
  import Wrap from "../../../../util/layout/Wrap.svelte";
  import DeclareUtil from "../../../detail/program/util/declareUtil";
  import UsageItem from "./UsageItem.svelte";

  export let method: StoreWork.OutputMethod;

  $: list = DeclareUtil.getUsableReserveList({
    method,
  }).map((res) => {
    const {valueDec} = DeclareUtil.createUtilDeclareDef(res);
    return { name: res, dcl: valueDec };
  });
</script>

<Record surplus={164}>
  <Wrap margin={4} bgColor={"rgb(115, 115, 135)"}>
    {#each list as item}
      <UsageItem name={item.name} type={item.dcl} />
      <Record height={8} />
    {/each}
  </Wrap>
</Record>
