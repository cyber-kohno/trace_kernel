<script lang="ts">
  import uiStore from '../../store/ui-store';
  import HalfPanel from '../../util/layout/HalfPanel.svelte';
  import Record from '../../util/layout/RecordDiv.svelte';
  import Wrap from '../../util/layout/Wrap.svelte';
  import MaintenancePane from '../maintenance/MaintenancePane.svelte';
  import WorkspaceEntryPane from './WorkspaceEntryPane.svelte';

  $: target = $uiStore.target;
</script>

<Wrap bgColor="#aaa">
  <HalfPanel>
    <Wrap margin={2} bgColor={'rgba(73, 73, 85, 1)'}>
      <WorkspaceEntryPane />
    </Wrap>
  </HalfPanel>
  <HalfPanel>
    <Wrap margin={2} bgColor={'rgba(73, 73, 85, 1)'}>
      {#if target}
        <MaintenancePane {target} />
      {/if}
    </Wrap>
  </HalfPanel>
</Wrap>
