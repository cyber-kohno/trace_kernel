<script lang="ts">
  import MaintenanceProcess from './MaintenanceProcess.svelte';
  import MaintenanceEnv from './MaintenanceEnv.svelte';
  import MaintenanceLogic from './program/MaintenanceLogic.svelte';
  import MaintenanceResource from './resource/MaintenanceResource.svelte';
  import MaintenanceWork from './program/MaintenanceWork.svelte';
  import type ValidationState from '../../state/model/validation-state';
  import MaintenanceDataset from './dataset/MaintenanceDataset.svelte';

  export let target: ValidationState.Target;

  const componentByCategory: Record<ValidationState.Category, any> = {
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
