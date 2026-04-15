<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import OperationButton from "../../../../../util/button/OperationButton.svelte";
  import ToastUtil from "../../../../../util/item/toastUtit";
  import type DclChannel from "../../util/channel/dclChannel";
  import Record from "../../../../../util/layout/RecordDiv.svelte";
  import DataUtil from "../../../../../util/data/dataUtil";

  export let channelId: string;
  export let total: number;
  export let columnDef: DclChannel.ColumnDef[];
</script>

<Record>
  <OperationButton
    name={"Clipboad"}
    width={140}
    callback={async () => {
      const lines = await invoke<string[]>("get_range_lines", {
        workerId: "a",
        channelId,
        from: 0,
        to: total,
      });
      const json = JSON.parse(`[${lines.join(",")}]`);
      const csvStr = DataUtil.convertJsonToTable(json, 'csv');
      navigator.clipboard.writeText(csvStr);
      ToastUtil.disp({
        text: "Copied the output to the clipboard!",
      });
    }}
  />
</Record>
<Record>
  <div class="wrap">
    <div class="cell" style:width="{80}px">{"Row"}</div>
    {#each columnDef as def}
      <div class="cell" style:width="{def.width ?? 100}px">{def.name}</div>
    {/each}
  </div>
</Record>

<style>
  .wrap {
    display: inline-block;
    position: relative;
    height: 25px;
    min-width: 100%;
    background-color: rgba(96, 96, 96, 0.543);
  }
  .cell {
    display: inline-block;
    position: relative;
    width: calc(100% - 80px);
    /* width: 200px; */
    height: 100%;
    width: 100px;
    color: white;
    font-size: 16px;
    line-height: 22px;
    padding-left: 4px;
    box-sizing: border-box;
    /* font-family: monospace; */
    white-space: nowrap;
    overflow: hidden;
    padding: 0 4px;
    border: 1px solid rgba(255, 255, 255, 0.436);
    vertical-align: top;
  }
</style>
