<script lang="ts">
  import type DclChannel from "../../util/channel/dclChannel";

  export let recordStr: string;
  export let index: number;
  export let columnDef: DclChannel.ColumnDef[];

  $: record = JSON.parse(recordStr) as Record<string, unknown>;
</script>

<div class="wrap" data--even={index % 2 === 0}>
  <div class="row">{index + 1}</div>
  {#each Object.values(record) as _, i}
    <div
      class="cell"
      style:width="{columnDef[i].width ?? 100}px"
      data--number={columnDef[i].type === 'number'}
    >
      {record[columnDef[i].name]}
    </div>
  {/each}
</div>

<style>
  .wrap {
    display: inline-block;
    position: relative;
    height: 100%;
    min-width: 100%;
    background-color: rgba(240, 248, 255, 0.119);
  }
  .wrap[data--even="true"] {
    background-color: rgba(200, 239, 250, 0.233);
  }
  .row {
    display: inline-block;
    position: relative;
    width: 80px;
    height: 100%;
    background-color: rgba(33, 102, 102, 0.562);
    color: white;
    font-size: 16px;
    line-height: 22px;
    padding-left: 4px;
    vertical-align: top;
    box-sizing: border-box;
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
    background-color: rgba(91, 255, 255, 0.268);
    /* font-family: monospace; */
    white-space: nowrap;
    overflow: hidden;
    padding: 0 4px;
    border: 1px solid rgba(255, 255, 255, 0.385);
    vertical-align: top;
  }
  .cell[data--number="true"] {
    text-align: right;
  }
</style>
