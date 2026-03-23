<script lang="ts">
  import OperationButton from "../../../../util/button/OperationButton.svelte";
  import Record from "../../../../util/layout/RecordDiv.svelte";
  import type DclChannel from "../util/channel/dclChannel";

  export let channels: { id: string; view: DclChannel.View }[];
  export let active: number;

  $: activeChannel = channels[active];

  export let move: (dir: -1 | 1) => void;

  $: prev = () => {
    if (active <= 0) return;
    move(-1);
  };
  $: next = () => {
    if (active === channels.length - 1) return;
    move(1);
  };
</script>

<Record height={30}>
  <OperationButton
    name="Prev"
    width={80}
    isDisable={active <= 0}
    callback={prev}
    isLineup
  />
  <OperationButton
    name="Next"
    width={80}
    isDisable={active == channels.length - 1}
    callback={next}
    isLineup
  />
  <div class="label">
    <span>{activeChannel == undefined ? "-" : `${activeChannel.id}`}</span>
    <span class="view">{activeChannel == undefined ? "" : `@${activeChannel.view}`}</span>
  </div>
</Record>

<style>
  .label {
    display: inline-block;
    position: relative;
    width: 306px;
    height: 24px;

    background-color: rgba(0, 0, 0, 0.349);
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 4px;

    span {
      font-size: 16px;
      font-weight: 600;
      color: rgb(155, 196, 208);
      font-style: italic;
    }
    .view {
      color: rgba(224, 248, 251, 0.267);
    }
    /* overflow: hidden; */
    /* white-space: nowrap; */
    /* vertical-align: top; */
  }
</style>
