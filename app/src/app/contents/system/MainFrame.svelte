<script lang="ts">
  import uiStore from "../../store/ui-store";
  import HalfPanel from "../../util/layout/HalfPanel.svelte";
  import Record from "../../util/layout/RecordDiv.svelte";
  import Wrap from "../../util/layout/Wrap.svelte";
  import MaintenanceManage from "../maintenance/MaintenanceManage.svelte";
  import ModuleManage from "./ModuleManage.svelte";

  $: target = $uiStore.target;
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
  <MaintenanceManage {target} />
      {/if}
    </Wrap>
  </HalfPanel>
</Wrap>
