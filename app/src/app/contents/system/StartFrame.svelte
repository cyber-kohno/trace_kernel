<script lang="ts">
  import store, { getSnapshot } from "../../store/store";
  import StoreWorkspace from "../../store/storeWorkspace";
  import FileUtil from "../../util/data/fileUtil";
  import RecordDiv from "../../util/layout/RecordDiv.svelte";

  const createBlank = async () => {
    $store.workspace = StoreWorkspace.getInitial();
    $store.snapshot = await getSnapshot($store.workspace);
    FileUtil.updateAppTitle();
  };
  $: loadFile = () => {
    FileUtil.loadWorkspaceChoose();
  };
</script>

<RecordDiv surplus={24}>
  <div class="wrap">
    <div class="record">
      <RecordDiv align={"center"} height={65}>
        <span class="emphasis">{"Start a workspace or open a .trk file."}</span>
      </RecordDiv>
      <RecordDiv align={"center"} height={55}>
        <button class="link" onclick={createBlank}>{"Start Empty"}</button>
        <span>&nbsp;</span>
        <button class="link" onclick={loadFile}>{"Open File"}</button>
      </RecordDiv>
    </div>
  </div>
</RecordDiv>
<RecordDiv height={24}>
  <div class="footer">{`© 2026 ${FileUtil.APP_NAME}`}</div>
</RecordDiv>

<style>
  .wrap {
    display: flex;
    align-items: center; /* 縦中央 */
    justify-content: center; /* 横中央 */

    margin: 16px;
    width: calc(100% - 32px);
    height: calc(100% - 32px);

    background-color: rgba(240, 248, 255, 0.018);
    border: 2px solid rgba(255, 255, 255, 0.031);
    border-radius: 4px;
    box-sizing: border-box;
  }
  .record {
    padding: 14px 12px;
    width: 500px;
    height: 120px;
    /* text-align: center; */

    background-color: rgba(99, 255, 255, 0.039);
    border-radius: 16px;

    * {
      font-size: 22px;
      color: rgb(255, 255, 255);
      font-weight: 600;
      line-height: 50px;
    }
  }
  .link {
    display: inline;
    position: relative;
    color: rgba(255, 255, 255, 0.749);
    background-color: rgba(188, 233, 246, 0.121);
    border-radius: 8px;
    padding: 2px 22px;
    user-select: none;
    border: none;
    &:hover {
      opacity: 0.8;
    }
  }
  .emphasis {
    color: rgb(255, 255, 255);
    /* color: rgb(255, 38, 38); */
  }

  .footer {
    width: 100%;
    height: 100%;
    background-color: rgba(240, 248, 255, 0.062);
    font-size: 17px;
    color: rgba(255, 255, 255, 0.371);
    font-weight: 400;
    line-height: 23px;
    text-align: right;
    padding-right: 20px;
    box-sizing: border-box;
  }

  button {
    width: 180px;
    text-align: center;
  }
</style>
