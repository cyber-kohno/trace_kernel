<script lang="ts">
  import DclChannel from '../../util/channel/dcl-channel';
  import StreamReceiver from '../StreamReceiver.svelte';
  import TableFixed from './TableFixed.svelte';
  import TableRecord from './TableRecord.svelte';

  export let channel: DclChannel.Props;
  export let executionId: string;

  let streamRef: StreamReceiver;

  export const receiveStream = () => streamRef.receiveStream();
  export const init = () => streamRef.init();
  export const end = () => streamRef.end();

  const columnDef: DclChannel.ColumnDef[] = channel.detail;
</script>

<StreamReceiver
  bind:this={streamRef}
  {executionId}
  channelId={channel.id}
  recordHeight={25}
  fixedAreaHeight={60}
>
  <svelte:fragment slot="fixed" let:total>
    <TableFixed {executionId} channelId={channel.id} {total} {columnDef} />
  </svelte:fragment>
  <svelte:fragment slot="record" let:record let:index>
    <TableRecord recordStr={record} {index} {columnDef} />
  </svelte:fragment>
</StreamReceiver>
