<script lang="ts">
  import PathUtil from "../../../../../../../util/data/pathUtil";
  import type TxPlanNormalize from "../../util/txPlanNormalize";

  export let order: TxPlanNormalize.RenameFileOrder;
</script>

<div class="file">
  {PathUtil.basename(order.from)} - {PathUtil.basename(order.to)}
</div>

<style>
  .file {
    display: inline-block;
    position: relative;
    vertical-align: top;
    font-size: 20px;
    font-weight: 400;
    width: 100%;
    height: 100%;
    color: yellow;
    background-color: rgba(127, 255, 212, 0.635);
  }
</style>
