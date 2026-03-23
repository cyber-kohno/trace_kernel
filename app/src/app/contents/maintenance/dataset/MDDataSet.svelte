<script lang="ts">
  import TextInput from "../../../util/form/TextInput.svelte";
  import LabelRecord from "../../../util/item/LabelRecord.svelte";
  import Record from "../../../util/layout/RecordDiv.svelte";
  import Wrap from "../../../util/layout/Wrap.svelte";
  import StoreWorkspace from "../../../store/storeWorkspace";
  import store from "../../../store/store";
  import OperationSwitch from "../../../util/button/OperationSwitch.svelte";
  import ScanCondPhase from "./scan/ScanCondPhase.svelte";
  import { onDestroy } from "svelte";
  import StoreInvalidate from "../../../store/storeInvalidate";
  import ChoosePhase from "./choose/ChoosePhase.svelte";
  import type StoreResource from "../../../store/StoreResource";
  import StoreCache from "../../../store/storeCache";
  import { writable } from "svelte/store";
  import type StoreDataset from "../../../store/storeDataset";
  import ListPhase from "./ListPhase.svelte";
  import PathState from "../../../util/form/validation/PathState.svelte";
  import DataUtil from "../../../util/data/dataUtil";

  let choosePhase = writable<StoreDataset.ChoosePhase>("scan");

  $: workspace = StoreWorkspace.getWorkspace($store);
  $: validate = () => {
    const target = StoreWorkspace.getTarget($store);
    StoreWorkspace.validate(target);
  };

  $: [itemIndex, dataset, invalidate] = (() => {
    const target = $store.target;
    if (target != null && target.cat === "dataset") {
      const dataset = workspace.datasets[target.index];
      return [
        target.index,
        dataset,
        () => {
          // project.datasets[target.index] = { ...dataset };
          $store.workspace = { ...workspace };
          validate();
        },
      ];
    }
    throw new Error();
  })();

  const setPhase = (phase: StoreDataset.ChoosePhase) => {
    $choosePhase = phase;
  };

  $: {
    StoreInvalidate.set({ key: "dataset", callback: invalidate });
  }

  onDestroy(() => {
    StoreInvalidate.remove("dataset");
  });

  $: hasTree = StoreCache.getEachChoose(itemIndex);

  $: directoryTree = (() => {
    $store.cacheMap; // 値変更を検知するために記述
    const value = StoreCache.getEachChoose(itemIndex);
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
      StoreCache.remove({ type: "dataset-choose", index: itemIndex });
    }
    dataset.targets = null;
    setPhase("scan");
    invalidate();
  };
  $: switchFileChoose = () => {
    dataset.targets = [];
    invalidate();
  };
</script>

<Wrap>
  <LabelRecord name={"variable_name"} />
  <TextInput
    value={dataset.varName}
    set={setName}
    width={"calc(100% - 4px)"}
    requied
  />
  <!-- ルートパス -->
  <LabelRecord name="root_path" />
  <TextInput
    value={dataset.rootPath}
    set={setRootPath}
    width={"calc(100% - 4px)"}
    requied
  />
  <PathState
    path={DataUtil.getAppliedEnvValue(dataset.rootPath, workspace.envs)}
    isDir={true}
  />
  <LabelRecord name={"encoding"} />
  <Record>
    <OperationSwitch
      name="UTF8"
      callback={() => setEncoding("utf8")}
      isActive={dataset.encoding === "utf8"}
    />
    <OperationSwitch
      name="SJIS"
      callback={() => setEncoding("sjis")}
      isActive={dataset.encoding === "sjis"}
    />
  </Record>
  <LabelRecord name={"scan_phase"} />
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
          callback={() => setPhase("scan")}
          isActive={$choosePhase === "scan"}
        />
        <OperationSwitch
          name="Choose"
          callback={() => setPhase("choose")}
          isActive={$choosePhase === "choose"}
          isDisable={hasTree == null}
        />
        <OperationSwitch
          name="List"
          callback={() => setPhase("list")}
          isActive={$choosePhase === "list"}
          isDisable={dataset.targets == null}
        />
      </Record>
      <Record surplus={30}>
        {#if $choosePhase === "scan"}
          <ScanCondPhase dataSet={dataset} {setPhase} />
        {:else if $choosePhase === "choose"}
          <ChoosePhase dataset={dataset} {setPhase} {validate} />
        {:else if $choosePhase === "list"}
          <ListPhase dataSet={dataset} />
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
