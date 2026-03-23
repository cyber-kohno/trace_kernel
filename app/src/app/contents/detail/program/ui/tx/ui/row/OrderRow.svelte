<script lang="ts">
  import PathUtil from "../../../../../../../util/data/pathUtil";
  import Column from "../../../../../../../util/layout/Column.svelte";
  import type TxDetailUtil from "../../util/txDetailUtil";
  import type TxExecuter from "../../util/txExecuter";
  import TxPlanUtil from "../../util/txPlanUtil";
  import CommitStatus from "./CommitStatus.svelte";
    import CreateFileRow from "./CreateFileRow.svelte";
  import ModifyFileRow from "./ModifyFileRow.svelte";

  export let row: TxExecuter.OrderRow;
  export let setDetail: (v: TxDetailUtil.Props | null) => void;

  $: getIcon = () => {
    const status = TxPlanUtil.getStatus(row.status);
    return TxPlanUtil.getIcon(status);
  };

  const order = row.order;
  $: status = row.status;

  const targetPath = ((): string => {
    switch (order.type) {
      case "rename_file":
      case "copy_file":
        return order.from;
      case "delete_file":
      case "modify_file":
      case "create_file":
        return order.path;
    }
  })();

  const orderName = (() => {
    switch (order.type) {
      case "copy_file":
        return "copy";
      case "create_file":
        return "create";
      case "modify_file":
        return "modify";
      case "delete_file":
        return "delete";
      case "rename_file":
        return "rename";
    }
  })();
</script>

<div class="unit">
  <Column width={40}>
    <div class="status">{getIcon()}</div>
  </Column>
  <Column surplus={40}>
    <div class="detail">
      <div class="dir">{PathUtil.dirname(targetPath)}</div>
      <div class="target">
        <div class="kind" data--kind={order.type}>{orderName}</div>
        {#if order.type === "create_file"}
          <CreateFileRow {order} {setDetail} />
        {:else if order.type === "modify_file"}
          <ModifyFileRow {order} {setDetail} />
        {:else if order.type === "delete_file"}
          <div class="file">{PathUtil.basename(targetPath)}</div>
        {:else if order.type === "copy_file"}
          <div class="file">{PathUtil.basename(targetPath)}</div>
        {:else if order.type === "rename_file"}
          <div class="file">
            {PathUtil.basename(targetPath)} - {PathUtil.basename(order.to)}
          </div>
        {/if}
      </div>
      <CommitStatus {status} />
    </div>
  </Column>
</div>

<style>
  .unit {
    display: inline-block;
    position: relative;
    width: 100%;
    /* height: 52px; */
    margin-top: 1px;
    background-color: rgba(0, 0, 0, 0.367);
    margin-top: 1px;
  }
  .status {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    font-size: 22px;
    font-weight: 600;
    /* background-color: rgba(255, 255, 255, 0.531); */
    padding: 8px 0 0 0;
    box-sizing: border-box;
    text-align: center;
  }
  .detail {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    padding: 0 0 0 4px;
    box-sizing: border-box;
  }
  .dir {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 22px;
    /* background-color: rgba(204, 129, 230, 0.349); */

    font-size: 14px;
    font-weight: 400;
    font-style: italic;
    color: rgba(255, 255, 255, 0.621);
  }
  .target {
    display: inline-block;
    position: relative;
    width: 100%;
    height: calc(100% - 22px);
    /* background-color: rgba(151, 230, 129, 0.349); */

    * {
      display: inline-block;
      position: relative;
      vertical-align: top;
      font-size: 20px;
    }
  }
  .kind {
    width: 80px;
    font-weight: 600;
    /* background-color: rgba(255, 255, 255, 0.398); */
  }
  .kind[data--kind="create_file"] {
    color: rgb(21, 255, 0);
  }
  .kind[data--kind="modify_file"] {
    color: rgb(0, 115, 255);
  }
  .kind[data--kind="delete_file"] {
    color: rgb(255, 0, 0);
  }
  .file {
    font-weight: 400;
    width: calc(100% - 80px);
    color: yellow;
  }
  span {
    color: white;
    font-size: 16px;
  }
</style>
