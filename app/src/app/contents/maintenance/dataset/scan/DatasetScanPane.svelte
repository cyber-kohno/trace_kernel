<script lang="ts">
  import DirectoryFilterConditions from './DirectoryFilterConditions.svelte';
  import { writable } from 'svelte/store';
  import FileFilterConditions from './FileFilterConditions.svelte';
  import NumberInput from '../../../../util/form/NumberInput.svelte';
  import OperationButton from '../../../../util/button/OperationButton.svelte';
  import workspaceStore from '../../../../store/workspace-store';
  import uiStore from '../../../../store/ui-store';
  import LabelRecord from '../../../../util/item/LabelRecord.svelte';
  import type StoreDataset from '../../../../store/store-dataset';
  import Record from '../../../../util/layout/RecordDiv.svelte';
  import StoreCache from '../../../../store/store-cache';
  import DatasetScanUtil from './dataset-scan-util';
  import StoreWorkspace from '../../../../store/store-workspace';
  import ToastUtil from '../../../../util/item/toast-util';
  import DatasetChooseUtil from '../choose/dataset-choose-util';

  let count = writable<number>(-1);
  let isSearch = writable(false);
  let scanningDispDir = writable<string[]>([]);

  export let dataset: StoreDataset.Props;
  export let setPhase: (phase: StoreDataset.DatasetPhase) => void;
  export let validate: () => void;

  $: scanOption = (() => {
    if (dataset.scanOption == null) throw new Error();
    return dataset.scanOption;
  })();

  $: isRequestOk = () => {
    return (
      dataset.rootPath.length >= 1 &&
      !scanOption.dirConds.some((c) => c.pattern.length === 0) &&
      !scanOption.fileConds.some((c) => c.pattern.length === 0)
    );
  };

  const reset = () => {
    scanOption.dirConds.length = 0;
    scanOption.fileConds.length = 0;
    delete scanOption.limitDepth;
    // dataset.scanOption = { ...scanOption };
  };

  const scan = () => {
    $isSearch = true;
    dataset.targets = [];
    validate();

    const workspace = StoreWorkspace.getWorkspace($workspaceStore);
    const newFilePath = workspace.envs.reduce(
      (ret, cur) => ret.replaceAll(`%${cur.varName}%`, cur.value),
      dataset.rootPath,
    );

    DatasetScanUtil.buildDirectoryTree({
      setCouner: (n) => ($count = n),
      setScanningDispDir: (s) => ($scanningDispDir = s),
      setSearch: (b) => ($isSearch = b),
      scanRequest: { rootPath: newFilePath, ...scanOption },
      endProc: (res) => {
        const fileCnt = DatasetChooseUtil.getDispRecords(res, true).length;
        if (fileCnt === 0) {
          ToastUtil.disp({ text: 'No matching files found.' });
          return;
        }
        StoreCache.addDatasetChoose($uiStore.target?.index ?? -1, res);
        setPhase('choose');
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
      dataset.scanOption = { ...scanOption };
    }}
    optional
  />
  <!-- ディレクトリ名の抽出条件 -->
  <LabelRecord name="directory_filter_conditions" sub={'depth and pattern'} />
  <DirectoryFilterConditions {scanOption} />
  <!-- ファイル名の抽出条件 -->
  <LabelRecord name="file_filter_conditions" />
  <FileFilterConditions {scanOption} />
</div>
<Record bgColor="#8888aa44" align="right">
  <OperationButton
    name={'Clear condition'}
    width={190}
    callback={reset}
    isLineup
  />

  {#if dataset.targets != null}
    <OperationButton
      name={'Scan'}
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
