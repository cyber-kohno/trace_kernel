<script lang="ts">
  import MaintenanceProcess from './MaintenanceProcess.svelte';
  import MaintenanceEnv from './MaintenanceEnv.svelte';
  import MaintenanceLogic from './program/MaintenanceLogic.svelte';
  import MaintenanceResource from './resource/MaintenanceResource.svelte';
  import MaintenanceWork from './program/MaintenanceWork.svelte';
  import type storeWorkspace from '../../store/store-workspace';
  import MaintenanceDataset from './dataset/MaintenanceDataset.svelte';

  export let target: storeWorkspace.Target;

  const componentByCategory: Record<storeWorkspace.Category, any> = {
    env: MaintenanceEnv,
    resource: MaintenanceResource,
    dataset: MaintenanceDataset,
    process: MaintenanceProcess,
    logic: MaintenanceLogic,
    work: MaintenanceWork,
  };

  $: maintenanceComponent = componentByCategory[target.cat];
</script>

{#key `${target.cat}:${target.index}`}
  <svelte:component this={maintenanceComponent} />
{/key}
