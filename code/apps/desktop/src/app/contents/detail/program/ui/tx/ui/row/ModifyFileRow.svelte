<script lang="ts">
  import PathUtil from '../../../../../../../util/data/path-util';
  import TxDetailUtil from '../../util/tx-detail-util';
  import type TxPlanNormalize from '../../util/tx-plan-normalize';

  export let order: TxPlanNormalize.ModifyFileOrder;
  export let setDetail: (v: TxDetailUtil.Props | null) => void;
</script>

<button
  class="file"
  onclick={() => {
    setDetail(TxDetailUtil.createDiffProps(order.original, order.current));
  }}
>
  {PathUtil.basename(order.path)}
</button>

<style>
  .file {
    display: inline-block;
    position: relative;
    vertical-align: top;
    font-size: 20px;
    font-weight: 400;
    width: 100%;
    height: 100%;
    color: rgb(255, 0, 0);
    background-color: transparent;
  }
</style>
