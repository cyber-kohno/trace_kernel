<script lang="ts">
  import store from "../../store/store";
  import StoreProcess from "../../store/StoreProcess";
  import StoreDataset from "../../store/storeDataset";
  import StoreWorkspace from "../../store/storeWorkspace";
  import StoreResource from "../../store/StoreResource";
  import StoreWork from "../../store/StoreWork";
  import LabelRecord from "../../util/item/LabelRecord.svelte";
  import Record from "../../util/layout/RecordDiv.svelte";
  import AddDelButton from "./AddDelButton.svelte";
  import PRProcess from "./params/PRProcess.svelte";
  import PREnv from "./params/PREnv.svelte";
  import PRResource from "./params/PRResource.svelte";
  import PRWork from "./params/PRWork.svelte";
  import storeLIcense from "../../store/storeLIcense";
  import PRDataset from "./params/PRDataset.svelte";

  $: workspace = StoreWorkspace.getWorkspace($store);
  $: validate = (target: StoreWorkspace.Target) => {
    StoreWorkspace.validate(target);
  };

  const addEnv = () => {
    workspace.envs.push({
      varName: "",
      value: "",
    });
    const target: StoreWorkspace.Target = {
      cat: "env",
      index: workspace.envs.length - 1,
    };
    validate(target);
    $store.target = target;
  };
  const addResource = () => {
    workspace.resources.push(StoreResource.getInitial(""));
    const target: StoreWorkspace.Target = {
      cat: "resource",
      index: workspace.resources.length - 1,
    };
    validate(target);
    $store.target = target;
  };
  const addDataset = () => {
    workspace.datasets.push(StoreDataset.getInitial(""));
    const target: StoreWorkspace.Target = {
      cat: "dataset",
      index: workspace.datasets.length - 1,
    };
    validate(target);
    $store.target = target;
  };
  const addProcess = () => {
    workspace.processes.push(StoreProcess.getInitial());
    const target: StoreWorkspace.Target = {
      cat: "process",
      index: workspace.processes.length - 1,
    };
    validate(target);
    $store.target = target;
  };
  const addWork = () => {
    const name = `work${workspace.works.length}`;
    workspace.works.push(StoreWork.getInitial(name));
    const target: StoreWorkspace.Target = {
      cat: "work",
      index: workspace.works.length - 1,
    };
    validate(target);
    $store.target = target;
  };

  $: openDeclare = () => {
    $store.dialog = "declare";
  };
</script>

<div class="category">
  <div class="label">{"context"}</div>
</div>

<div class="indent">
  <!-- 環境変数 -->
  <LabelRecord name={"-env"} />
  {#each workspace.envs as _, index}
    <PREnv {index} />
  {/each}
  <Record><AddDelButton callback={addEnv} /></Record>

  <!-- リソース -->
  <LabelRecord name={"-resource"} />
  {#each workspace.resources as _, index}
    <PRResource {index} />
  {/each}
  <Record><AddDelButton callback={addResource} /></Record>

  <!-- データセット -->
  <LabelRecord name={"-dataset"} />
  {#each workspace.datasets as _, index}
    <PRDataset {index} />
  {/each}
  <Record><AddDelButton callback={addDataset} /></Record>

  <!-- プロセス -->
  {#if storeLIcense.isPro()}
    <LabelRecord name={"-process"} />
    {#each workspace.processes as _, index}
      <PRProcess {index} />
    {/each}
    <Record><AddDelButton callback={addProcess} /></Record>
  {/if}
</div>

<div class="category">
  <div class="label">{"program"}</div>
  <div class="right">
    <button onclick={openDeclare}>{"__common_declare__"}</button>
  </div>
</div>

<div class="indent">
  <!-- ワーク -->
  <LabelRecord name={"-work"} />
  {#each workspace.works as _, index}
    <PRWork {index} />
  {/each}
  <Record><AddDelButton callback={addWork} /></Record>
</div>

<style>
  .indent {
    display: inline-block;
    position: relative;
    width: 100%;
    padding: 0 0 0 8px;
    background-color: rgba(255, 255, 255, 0.041);
    box-sizing: border-box;
  }
  .category {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 30px;
    /* background-color: rgb(57, 57, 57); */
    margin-top: 4px;

    text-align: left;
  }
  .label {
    display: inline-block;
    font-size: 18px;
    font-weight: 600;
    color: rgba(219, 251, 255, 0.646);
    font-style: italic;
    padding: 0 0 0 4px;
    box-sizing: border-box;
    width: 100px;
  }
  .right {
    display: inline-block;
    width: calc(100% - 100px);
    text-align: right;
  }

  button {
    display: inline-block;
    position: relative;
    height: 24px;
    margin: 3px 4px 0 0;
    padding: 0 12px;
    box-sizing: border-box;
    color: rgba(147, 194, 180, 0.97);
    font-size: 18px;
    line-height: 24px;
    font-weight: 600;
    border: none;
    text-align: center;
    /* background-color: rgba(240, 248, 255, 0.086); */
    background-color: transparent;
    border-radius: 4px;
    font-style: italic;
    text-decoration: underline;

    &:hover {
      color: rgba(255, 255, 255, 0.97);
      /* opacity: 0.81; */
    }
  }
</style>
