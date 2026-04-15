<script lang="ts">
  import PathUtil from "../../../../../../../util/data/pathUtil";
  import type TxPlanNormalize from "../../util/txPlanNormalize";

  export let order: TxPlanNormalize.MakeDirOrder;
</script>

<div class="wrap">
  {PathUtil.normalize(order.path)}
</div>

<style>
  .wrap {
    display: inline-block;
    position: relative;
    font-size: 16px;
    font-weight: 400;
    width: 100%;
    height: 100%;
    color: rgb(255, 96, 152);
    /* background-color: rgba(0, 255, 255, 0.362); */
    padding: 10px 0 0 4px;
    box-sizing: border-box;
    overflow: hidden;
    white-space: nowrap;
  }
</style>
