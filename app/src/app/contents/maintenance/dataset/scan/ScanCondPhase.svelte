<script lang="ts">
  import DirNameFilterConds from "./DirNameFilterConds.svelte";
  import { writable } from "svelte/store";
  import FileNameFilterConds from "./FileNameFilterConds.svelte";
  import NumberInput from "../../../../util/form/NumberInput.svelte";
  import OperationButton from "../../../../util/button/OperationButton.svelte";
  import store from "../../../../store/store";
  import LabelRecord from "../../../../util/item/LabelRecord.svelte";
  import type StoreDataset from "../../../../store/storeDataset";
  import Record from "../../../../util/layout/RecordDiv.svelte";
  import StoreCache from "../../../../store/storeCache";
  import ScanUtil from "./ScanUtil";
  import StoreWorkspace from "../../../../store/storeWorkspace";
  import ToastUtil from "../../../../util/item/toastUtit";
  import ChooseUtil from "../choose/chooseUtil";

  let count = writable<number>(-1);
  let isSearch = writable(false);
  let scanningDispDir = writable<string[]>([]);

  export let dataSet: StoreDataset.Props;
  export let setPhase: (phase: StoreDataset.ChoosePhase) => void;

  $: scanOption = (() => {
    if (dataSet.scanOption == null) throw new Error();
    return dataSet.scanOption;
  })();

  $: isRequestOk = () => {
    return (
      dataSet.rootPath.length >= 1 &&
      !scanOption.dirConds.some((c) => c.pattern.length === 0) &&
      !scanOption.fileConds.some((c) => c.pattern.length === 0)
    );
  };

  const reset = () => {
    scanOption.dirConds.length = 0;
    scanOption.fileConds.length = 0;
    delete scanOption.limitDepth;
    // dataSet.scanOption = { ...scanOption };
  };

  const scan = () => {
    $isSearch = true;

    const workspace = StoreWorkspace.getWorkspace($store);
    const newFilePath = workspace.envs.reduce(
      (ret, cur) => ret.replaceAll(`%${cur.varName}%`, cur.value),
      dataSet.rootPath,
    );

    ScanUtil.buildDirectoryTree({
      setCouner: (n) => ($count = n),
      setScanningDispDir: (s) => ($scanningDispDir = s),
      setSearch: (b) => ($isSearch = b),
      scanRequest: { rootPath: newFilePath, ...scanOption },
      endProc: (res) => {
        const fileCnt = ChooseUtil.getDispRecords(res, true).length;
        if (fileCnt === 0) {
          ToastUtil.disp({ text: "No matching files found." });
          return;
        }
        StoreCache.addEachChoose($store.target?.index ?? -1, res);
        setPhase("choose");

        $store = { ...$store };
      },
    });
  };
</script>

<!-- リクエストフレーム -->
<div class="list-frame">
  <!-- 走査階層の上限（どこまで深くスキャンするか） -->
  <LabelRecord name="limit_depth" />
  <NumberInput
    min={0}
    max={50}
    value={scanOption.limitDepth}
    set={(v) => {
      scanOption.limitDepth = v;
      dataSet.scanOption = { ...scanOption };
    }}
    optional
  />
  <!-- ディレクトリ名の抽出条件 -->
  <LabelRecord name="directory_filter_conditions" sub={"depth and pattern"} />
  <DirNameFilterConds req={scanOption} />
  <!-- ファイル名の抽出条件 -->
  <LabelRecord name="file_filter_conditions" />
  <FileNameFilterConds req={scanOption} />
</div>
<Record bgColor="#8888aa44" align="right">
  <OperationButton
    name={"Clear condition"}
    width={190}
    callback={reset}
    isLineup
  />

  {#if dataSet.targets != null}
    <OperationButton
      name={"Scan"}
      width={160}
      isDisable={!isRequestOk()}
      callback={scan}
      isLineup
    />
  {/if}
</Record>
{#if $isSearch}
  <div class="blind">
    <div class="list-item">{$count}</div>
    {#each $scanningDispDir as dirNode, i}
      {#if i === 0}
        <div class="list-item"><span class="root">{dirNode}</span></div>
      {:else}
        <div class="list-item"><span class="node">{dirNode}</span></div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .list-frame {
    display: inline-block;
    position: relative;
    width: 100%;
    height: calc(100% - 32px);
    overflow: auto;
  }
  .list-item {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 20px;
    /* background-color: #ffffff33; */
    font-size: 14px;
    color: #fffffff0;
    font-weight: 600;
    padding: 0 0 0 4px;
    box-sizing: border-box;
    margin: 1px 0 0 0;
    /*overflow: hidden;*/
    white-space: nowrap;
  }
  .blind {
    display: inline-block;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: #002662cc;
    z-index: 2;
  }
  .list-item > .root {
    color: rgb(255, 77, 0);
  }
  .list-item > .node {
    color: rgb(255, 208, 0);
  }
</style>
