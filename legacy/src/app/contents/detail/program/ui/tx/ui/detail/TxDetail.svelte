<script lang="ts">
    import OperationButton from "../../../../../../../util/button/OperationButton.svelte";
    import RecordDiv from "../../../../../../../util/layout/RecordDiv.svelte";
    import Wrap from "../../../../../../../util/layout/Wrap.svelte";
    import type TxDetailUtil from "../../util/txDetailUtil";
    import DiffViewer from "../../../../../../../util/component/DiffViewer.svelte";
    import SingleTextViewer from "../../../../../../../util/component/SingleTextViewer.svelte";

    export let detail: TxDetailUtil.Props;
    export let close: () => void;
</script>

<div class="cover">
    <Wrap margin={8}>
        <RecordDiv height={30}>
            <div class="header">
                <OperationButton name={"Close"} width={100} callback={close} />
            </div>
        </RecordDiv>
        <RecordDiv surplus={30}>
            <div class="main">
                {#if detail.kind === "single"}
                    <SingleTextViewer
                        content={detail.content}
                    />
                {:else if detail.kind === "diff"}
                    <DiffViewer
                        original={detail.original}
                        current={detail.current}
                    />
                {/if}
            </div>
        </RecordDiv>
    </Wrap>
</div>

<style>
    .cover {
        display: inline-block;
        position: absolute;
        left: 0;
        top: 0;
        z-index: 8;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.607);
    }
    .header {
        display: inline-block;
        position: relative;
        width: 100%;
        height: 100%;
        background-color: rgba(90, 90, 90, 0.999);
    }
    .main {
        display: inline-block;
        position: relative;
        width: 100%;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.849);
        /* border: 1px solid rgb(255, 255, 255);
        box-sizing: border-box; */
    }
</style>
