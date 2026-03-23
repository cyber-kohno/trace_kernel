<script lang="ts">
  import { writable } from "svelte/store";
  import OrderRow from "./row/OrderRow.svelte";
  import TxPlanNormalize from "../util/txPlanNormalize";
  import TxExecuter from "../util/txExecuter";
  import type RuntimeUtil from "../../../runtime/runtimeUtil";
  import Blind from "../../../../../../util/layout/Blind.svelte";
  import Wrap from "../../../../../../util/layout/Wrap.svelte";
  import RecordDiv from "../../../../../../util/layout/RecordDiv.svelte";
  import TxPhaseMonitor from "./TxPhaseMonitor.svelte";
  import Column from "../../../../../../util/layout/Column.svelte";
  import OrderSummary from "./OrderSummary.svelte";
  import BusyIndicator from "../../../../../../util/item/BusyIndicator.svelte";
  import ProgressBar from "../../ProgressBar.svelte";
  import OperationButton from "../../../../../../util/button/OperationButton.svelte";
  import TxDetailUtil from "../util/txDetailUtil";
  import TxDetail from "./detail/TxDetail.svelte";

  export let vfs: RuntimeUtil.VFSState;
  export let close: () => void;
  const orders = TxPlanNormalize.convertVfsToOrder(vfs);

  const orderRows = writable<TxExecuter.OrderRow[]>(
    orders.map((order) => ({ order, status: {} })),
  );

  let progress = writable<number>(0);
  let isProcessing = writable<boolean>(false);
  const detail = writable<TxDetailUtil.Props | null>(null);

  $: setDetail = (v: TxDetailUtil.Props | null) => {
    $detail = v;
  };

  let phase = writable<TxExecuter.Phase>("confirm");

  $: commit = async () => {
    $isProcessing = true;

    await TxExecuter.run({
      setPhase: (v) => ($phase = v),
      rows: $orderRows,
      progressTick: () => {
        $progress++;
      },
    });
    $progress = 0;
    $isProcessing = false;
    $orderRows = $orderRows.slice();
  };
</script>

<Blind zIndex={6} bgColor={"rgba(0, 0, 0, 0.398)"}>
  <Wrap margin={20}>
    <div class="frame">
      <!-- レコードの詳細情報（前面表示） -->
      {#if $detail != null}
        <TxDetail detail={$detail} close={() => setDetail(null)} />
      {/if}
      <RecordDiv height={30} bgColor={"#555"} align="right">
        <Column width={280}>
          <TxPhaseMonitor phase={$phase} />
        </Column>
        <Column surplus={280}>
          <OrderSummary rows={$orderRows} />
        </Column>
      </RecordDiv>
      <RecordDiv surplus={60}>
        <Wrap margin={2}>
          {#each $orderRows as row}
            <OrderRow {row} {setDetail} />
          {/each}
        </Wrap>
        {#if $isProcessing}
          <div class="lock">
            <div class="info">
              {#if $phase === "verify"}
                <BusyIndicator>
                  <div class="msg">Verifying transaction...</div>
                </BusyIndicator>
              {:else if $phase === "commit"}
                <ProgressBar rate={($progress / orders.length) * 100} />
              {/if}
            </div>
          </div>
        {/if}
      </RecordDiv>
      <RecordDiv height={30} bgColor={"#555"} align="right">
        <OperationButton
          name={orders.length >= 1 && $phase !== "commit" ? "Later" : "close"}
          isLineup
          width={150}
          callback={close}
        />
        <OperationButton
          name={"Commit"}
          isLineup
          width={150}
          callback={() => {
            commit();
          }}
          isDisable={orders.length === 0 || $phase === "commit"}
        />
      </RecordDiv>
    </div>
  </Wrap>
</Blind>

<style>
  .frame {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    border: 2px rgba(255, 255, 255, 0.546) solid;
    box-sizing: border-box;
    background-color: rgba(46, 90, 115, 0.409);
    backdrop-filter: blur(10px);
  }
  .lock {
    display: flex; /* 変更 */
    justify-content: center; /* 横中央 */
    align-items: center; /* 縦中央 */

    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    z-index: 7;
    background-color: rgba(0, 0, 0, 0.808);
  }
  .info {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 140px;
    /* background-color: rgba(63, 149, 199, 0.503); */
  }
  .msg {
    display: inline-block;
    position: relative;
    /* background-color: rgba(127, 255, 212, 0.235); */
    color: white;
    width: 100%;
    font-weight: 600;
    font-size: 20px;
    /* padding-left: 4px;
    box-sizing: border-box; */
    text-align: center;
  }
</style>
