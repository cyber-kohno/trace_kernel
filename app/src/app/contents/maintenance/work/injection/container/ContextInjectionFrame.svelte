<script lang="ts">
  import store from "../../../../../store/store";
  import StoreWorkspace from "../../../../../store/storeWorkspace";
  import Record from "../../../../../util/layout/RecordDiv.svelte";
  import Wrap from "../../../../../util/layout/Wrap.svelte";
  import ContextDataUtil from "../../../../detail/program/util/contextDataUtil";
  import InjectionItem from "./ContextInjectionItem.svelte";

  $: workspace = StoreWorkspace.getWorkspace($store);

  $: contexts = ContextDataUtil.getUsableData(workspace, $store.disables);
</script>

<Record surplus={364}>
  <Wrap margin={4} bgColor={"rgba(115, 115, 135, 0.4)"}>
    <!-- {#each apis as api}
      <InjectionItem str={api} />
    {/each} -->
    {#each contexts.envs as env}
      <InjectionItem prefix={'$env'} item={env.varName} />
    {/each}
    {#each contexts.resources as resource}
      <InjectionItem prefix={'$resource'} item={resource.varName} />
    {/each}
    {#each contexts.datasets as dataset}
      <InjectionItem prefix={'$dataset'} item={dataset.varName} />
    {/each}
    {#each contexts.processes as process}
      <InjectionItem prefix={'$process'} item={process.funcName} />
    {/each}
  </Wrap>
</Record>
