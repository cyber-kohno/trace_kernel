<script lang="ts">
  import store from "../../store/store";
  import HalfPanel from "../../util/layout/HalfPanel.svelte";
  import Record from "../../util/layout/RecordDiv.svelte";
  import Wrap from "../../util/layout/Wrap.svelte";
  import MaintenanceMange from "../maintenance/MaintenanceMange.svelte";
  import ModuleManage from "./ModuleManage.svelte";

  $: target = $store.target;
</script>

<Wrap bgColor="#aaa">
  <HalfPanel>
    <Wrap margin={2} bgColor={"rgba(73, 73, 85, 1)"}>
      <ModuleManage />
    </Wrap>
  </HalfPanel>
  <HalfPanel>
    <Wrap margin={2} bgColor={"rgba(73, 73, 85, 1)"}>
      {#if target}
        <MaintenanceMange {target} />
      {/if}
    </Wrap>
  </HalfPanel>
</Wrap>
