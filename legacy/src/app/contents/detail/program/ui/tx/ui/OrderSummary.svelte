<script lang="ts">
    import type TxExecuter from "../util/txExecuter";
    import TxPlanUtil from "../util/txPlanUtil";


  export let rows: TxExecuter.OrderRow[];

  $: summaries = () => {
    const list: { status: TxPlanUtil.TxStatus; cnt: number }[] = [];

    rows.forEach((row) => {
      const status = TxPlanUtil.getStatus(row.status);
      let summry = list.find((s) => s.status === status);
      if (!summry) {
        summry = { status, cnt: 0 };
        list.push(summry);
      }
      summry.cnt++;
    });
    return list;
  };
</script>

<div class="wrap">
  {#each summaries() as s}
    <div class="item">{`${TxPlanUtil.getIcon(s.status)} ${s.cnt}`}</div>
  {/each}
</div>

<style>
  .wrap {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    text-align: left;
    background-color: black;
  }
  .item {
    display: inline-block;
    position: relative;
    padding: 0 4px;
    box-sizing: border-box;
    /* background-color: rgba(127, 255, 212, 0.322); */

    font-weight: 600;
    font-size: 18px;
    line-height: 26px;
    margin: 0 0 0 8px;
    height: 100%;
    vertical-align: top;
  }
</style>
