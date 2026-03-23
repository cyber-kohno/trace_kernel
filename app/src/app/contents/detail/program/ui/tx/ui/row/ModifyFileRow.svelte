<script lang="ts">
    import PathUtil from "../../../../../../../util/data/pathUtil";
    import TxDetailUtil from "../../util/txDetailUtil";
    import type TxPlanNormalize from "../../util/txPlanNormalize";

    export let order: TxPlanNormalize.ModifyFileOrder;
    export let setDetail: (v: TxDetailUtil.Props | null) => void;
</script>

<div
    class="file"
    onclick={() => {
        setDetail(TxDetailUtil.createDiffProps(order.original, order.current));
    }}
>
    {PathUtil.basename(order.path)}
</div>

<style>
    .file {
        display: inline-block;
        position: relative;
        vertical-align: top;
        font-size: 20px;
        font-weight: 400;
        width: calc(100% - 80px);
        color: yellow;
    }
</style>
