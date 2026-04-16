<script lang="ts">
  import TextInput from '../../../util/form/TextInput.svelte';
  import LabelRecord from '../../../util/item/LabelRecord.svelte';
  import Record from '../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../util/layout/Wrap.svelte';
  import StoreWorkspace from '../../../store/store-workspace';
  import cacheStore from '../../../store/cache-store';
  import workspaceStore from '../../../store/workspace-store';
  import uiStore from '../../../store/ui-store';
  import OperationSwitch from '../../../util/button/OperationSwitch.svelte';
  import DatasetScanPane from './scan/DatasetScanPane.svelte';
  import { onDestroy } from 'svelte';
  import StoreInvalidate from '../../../store/store-invalidate';
  import DatasetChoosePane from './choose/DatasetChoosePane.svelte';
  import type StoreResource from '../../../store/store-resource';
  import StoreCache from '../../../store/store-cache';
  import { writable } from 'svelte/store';
  import type StoreDataset from '../../../store/store-dataset';
  import DatasetTargetListPane from './DatasetTargetListPane.svelte';
  import PathState from '../../../util/form/validation/PathState.svelte';
  import DataUtil from '../../../util/data/data-util';
  import { commitWorkspace, getTargetEntry } from '../maintenance-helpers';

  let datasetPhase = writable<StoreDataset.DatasetPhase>('scan');

  $: workspace = StoreWorkspace.getWorkspace($workspaceStore);

  $: datasetTarget = (() => {
    const target = $uiStore.target;
    if (target != null && target.cat === 'dataset') {
      return target;
    }
    throw new Error();
  })();

  $: itemIndex = datasetTarget.index;
  $: dataset = getTargetEntry($uiStore.target, 'dataset', workspace.datasets);

  $: invalidate = () => {
    commitWorkspace(workspace);
  };

  $: validate = () => {
    invalidate();
  };

  const setPhase = (phase: StoreDataset.DatasetPhase) => {
    $datasetPhase = phase;
  };

  $: {
    StoreInvalidate.set({ key: 'dataset', callback: invalidate });
  }

  onDestroy(() => {
    StoreInvalidate.remove('dataset');
  });

  $: hasTree = StoreCache.getDatasetChoose(itemIndex);

  $: directoryTree = (() => {
    $cacheStore.cacheMap; // 値変更を検知するために記述
    const value = StoreCache.getDatasetChoose(itemIndex);
    return value;
  })();

  $: setName = (v: string) => {
    dataset.varName = v;
    invalidate();
  };
  $: setRootPath = (v: string) => {
    dataset.rootPath = v;
    invalidate();
  };

  $: setEncoding = (v: StoreResource.Encoding) => {
    dataset.encoding = v;
    invalidate();
  };

  $: switchAll = () => {
    if (directoryTree != null) {
      StoreCache.remove({ type: 'dataset-choose', index: itemIndex });
    }
    dataset.targets = null;
    setPhase('scan');
    invalidate();
  };
  $: switchFileChoose = () => {
    dataset.targets = [];
    invalidate();
  };
</script>

<Wrap>
  <LabelRecord name={'variable_name'} />
  <TextInput
    value={dataset.varName}
    set={setName}
    width={'calc(100% - 4px)'}
    requied
  />
  <!-- ルートパス -->
  <LabelRecord name="root_path" />
  <TextInput
    value={dataset.rootPath}
    set={setRootPath}
    width={'calc(100% - 4px)'}
    requied
  />
  <PathState
    path={DataUtil.getAppliedEnvValue(dataset.rootPath, workspace.envs)}
    isDir={true}
  />
  <LabelRecord name={'encoding'} />
  <Record>
    <OperationSwitch
      name="UTF8"
      callback={() => setEncoding('utf8')}
      isActive={dataset.encoding === 'utf8'}
    />
    <OperationSwitch
      name="SJIS"
      callback={() => setEncoding('sjis')}
      isActive={dataset.encoding === 'sjis'}
    />
  </Record>
  <LabelRecord name={'scan_phase'} />
  <Record>
    <OperationSwitch
      name="Runtime auto"
      callback={switchAll}
      isActive={dataset.targets == null}
    />
    <OperationSwitch
      name="Direct choose"
      callback={switchFileChoose}
      isActive={dataset.targets != null}
    />
  </Record>
  <Record surplus={270} bgColor="#445">
    <div class="sub">
      <Record height={30} bgColor="#778">
        <OperationSwitch
          name="Scan"
          callback={() => setPhase('scan')}
          isActive={$datasetPhase === 'scan'}
        />
        <OperationSwitch
          name="Choose"
          callback={() => setPhase('choose')}
          isActive={$datasetPhase === 'choose'}
          isDisable={hasTree == null}
        />
        <OperationSwitch
          name="List"
          callback={() => setPhase('list')}
          isActive={$datasetPhase === 'list'}
          isDisable={dataset.targets == null}
        />
      </Record>
      <Record surplus={30}>
        {#if $datasetPhase === 'scan'}
          <DatasetScanPane {dataset} {setPhase} />
        {:else if $datasetPhase === 'choose'}
          <DatasetChoosePane {dataset} {setPhase} {validate} />
        {:else if $datasetPhase === 'list'}
          <DatasetTargetListPane {dataset} />
        {/if}
      </Record>
    </div>
  </Record>
</Wrap>

<style>
  .sub {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    border: 2px rgb(199, 199, 211) solid;
    box-sizing: border-box;
    border-radius: 4px;
  }
</style>
