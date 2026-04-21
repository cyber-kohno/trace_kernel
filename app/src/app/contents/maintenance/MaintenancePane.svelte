<script lang="ts">
  import MaintenanceProcess from './MaintenanceProcess.svelte';
  import MaintenanceEnv from './MaintenanceEnv.svelte';
  import MaintenanceResource from './resource/MaintenanceResource.svelte';
  import MaintenanceWork from './work/MaintenanceWork.svelte';
  import type storeWorkspace from '../../store/store-workspace';
  import MaintenanceDataset from './dataset/MaintenanceDataset.svelte';

  export let target: storeWorkspace.Target;

  const componentByCategory: Record<storeWorkspace.Category, any> = {
    env: MaintenanceEnv,
    resource: MaintenanceResource,
    dataset: MaintenanceDataset,
    process: MaintenanceProcess,
    work: MaintenanceWork,
  };

  $: maintenanceComponent = componentByCategory[target.cat];
</script>

<svelte:component this={maintenanceComponent} />
