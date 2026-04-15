<script lang="ts">
  import PathUtil from "../../../../../../../util/data/pathUtil";
  import type TxPlanNormalize from "../../util/txPlanNormalize";

  export let order: TxPlanNormalize.CopyFileOrder;
</script>

<div class="wrap">
  <div class="from">{PathUtil.normalize(order.from)}</div>
  <div class="dest">{PathUtil.normalize(order.to)}</div>
  >
</div>

<style>
  .wrap {
    display: inline-block;
    position: relative;
    width: 100%;
    div {
      vertical-align: top;
      font-size: 16px;
      font-weight: 400;
      width: 100%;
      height: 50%;
      /* text-align: right; */
      overflow-x: hidden;
      white-space: nowrap;
    }
  }
  .from {
    color: rgba(255, 255, 255, 0.45);
  }
  .dest {
    color: rgb(152, 227, 255);
    /* background-color: #ffffff31; */
  }
</style>
