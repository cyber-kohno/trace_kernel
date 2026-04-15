<script lang="ts">
  import MaintenanceProcess from "./MaintenanceProcess.svelte";
  import MaintenanceEnv from "./MaintenanceEnv.svelte";
  import MaintenanceResource from "./MaintenanceResource.svelte";
  import MaintenanceWork from "./work/MaintenanceWork.svelte";
  import type storeWorkspace from "../../store/store-workspace";
  import MaintenanceDataset from "./dataset/MaintenanceDataset.svelte";

  export let target: storeWorkspace.Target;
</script>

{#if target.cat === "env"}
  <MaintenanceEnv />
{:else if target.cat === "resource"}
  <MaintenanceResource />
{:else if target.cat === "dataset"}
  <MaintenanceDataset />
{:else if target.cat === "process"}
  <MaintenanceProcess />
{:else if target.cat === "work"}
  <MaintenanceWork />
{/if}
