<script lang="ts">
  import LabelRecord from '../../util/item/LabelRecord.svelte';
  import Record from '../../util/layout/RecordDiv.svelte';
  import AddDelButton from './AddDelButton.svelte';

  export let label: string;
  export let items: unknown[];
  export let entryComponent: any;
  export let add: () => void;
</script>

<LabelRecord name={label} />
{#each items as _, index}
  <svelte:component this={entryComponent} {index} />
{/each}
<Record><AddDelButton callback={add} /></Record>
