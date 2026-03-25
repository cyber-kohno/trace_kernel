<script lang="ts">
  import PathUtil from "../../../../../../../util/data/pathUtil";
  import Column from "../../../../../../../util/layout/Column.svelte";
  import RecordDiv from "../../../../../../../util/layout/RecordDiv.svelte";
  import type TxDetailUtil from "../../util/txDetailUtil";
  import type TxExecuter from "../../util/txExecuter";
  import TxPlanUtil from "../../util/txPlanUtil";
  import CommitStatus from "./CommitStatus.svelte";
  import CopyFileRow from "./CopyFileRow.svelte";
  import CreateFileRow from "./CreateFileRow.svelte";
  import DeleteFileRow from "./DeleteFileRow.svelte";
  import MakeDirRow from "./MakeDirRow.svelte";
  import ModifyFileRow from "./ModifyFileRow.svelte";
  import RenameFileRow from "./RenameFileRow.svelte";

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
      case "create_dir":
        return order.path;
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
      case "create_dir":
        return "mkdir";
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
  <Column width={140}>
    <Column width={40}>
      <div class="status">{getIcon()}</div>
    </Column>
    <Column surplus={40}>
      <div class="kind" data--kind={order.type}>{orderName}</div>
    </Column>
  </Column>
  <Column surplus={140}>
    <div class="detail">
      {#if ["create_file", "modify_file", "delete_file", "rename_file"].includes(order.type)}
        <RecordDiv height={22}>
          <div class="dir">{PathUtil.dirname(targetPath)}</div>
        </RecordDiv>
        <RecordDiv surplus={22}>
          {#if order.type === "create_file"}
            <CreateFileRow {order} {setDetail} />
          {:else if order.type === "modify_file"}
            <ModifyFileRow {order} {setDetail} />
          {:else if order.type === "delete_file"}
            <DeleteFileRow {order} />
          {:else if order.type === "rename_file"}
            <RenameFileRow {order} />
          {/if}
        </RecordDiv>
      {:else if order.type === "copy_file"}
        <CopyFileRow {order} />
      {:else if order.type === "create_dir"}
        <MakeDirRow {order} />
      {/if}
    </div>
    <CommitStatus {status} />
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
    /* background-color: rgba(231, 4, 4, 0.367); */
    margin-top: 1px;
  }
  .status {
    display: inline-block;
    position: relative;
    width: 100%;
    /* height: 100%; */
    font-size: 22px;
    font-weight: 600;
    /* background-color: rgba(105, 255, 135, 0.531); */
    padding: 8px 0 0 0;
    box-sizing: border-box;
    text-align: center;
    vertical-align: top;
  }
  .detail {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 52px;
    padding: 0 0 0 4px;
    box-sizing: border-box;
  }
  .dir {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    /* background-color: rgba(204, 129, 230, 0.349); */

    font-size: 14px;
    font-weight: 400;
    font-style: italic;
    color: rgba(255, 255, 255, 0.621);
  }
  .kind {
    width: 100%;
    height: 100%;
    font-weight: 500;
    font-size: 22px;
    vertical-align: top;
    /* background-color: rgba(255, 255, 255, 0.398); */
    padding: 10px 0 0 4px;
    box-sizing: border-box;
  }
  .kind[data--kind="create_dir"] {
    color: rgb(255, 234, 6);
  }
  .kind[data--kind="copy_file"] {
    color: rgb(0, 255, 149);
  }
  .kind[data--kind="create_file"] {
    color: rgb(21, 255, 0);
  }
  .kind[data--kind="modify_file"] {
    color: rgb(0, 115, 255);
  }
  .kind[data--kind="rename_file"] {
    color: rgb(102, 0, 255);
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
