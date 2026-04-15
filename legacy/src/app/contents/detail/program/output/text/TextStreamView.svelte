<script lang="ts">
  import type DclChannel from "../../util/channel/dclChannel";
  import StreamReceiver from "../StreamReceiver.svelte";
  import TextFixed from "./TextFixed.svelte";
  import TextRecord from "./TextRecord.svelte";

  export let channel: DclChannel.Props;

  let streamRef: StreamReceiver;

  export const receiveStream = () => streamRef.receiveStream();
  export const init = () => streamRef.init();
  export const end = () => streamRef.end();
</script>

<StreamReceiver
  bind:this={streamRef}
  channelId={channel.id}
  recordHeight={25}
  fixedAreaHeight={30}
>
  <svelte:fragment slot="fixed" let:total>
    <TextFixed channelId={channel.id} {total} />
  </svelte:fragment>
  <svelte:fragment slot="record" let:record let:index>
    <TextRecord {record} {index} />
  </svelte:fragment>
</StreamReceiver>
