<script lang="ts">
  import store from "../../../store/store";
  import StoreProject from "../../../store/storeWorkspace";
  import ParamRecord from "./ParamRecord.svelte";

  export let index: number;

  $: workspace = StoreProject.getWorkspace($store);
  $: validate = () => {
    const target = StoreProject.getTarget($store);
    StoreProject.validate(target);
  };

  $: isFocus = (() => {
    const target = $store.target;
    return target != null && target.cat === "dataset" && target.index === index;
  })();

  $: focus = () => {
    $store.target = { cat: "dataset", index };
  };

  $: del = () => {
    workspace.datasets.splice(index, 1);
    workspace.datasets = workspace.datasets.slice();
    $store.target = null;
    $store.workspace = { ...workspace };
    validate();
  };

  $: dataSets = workspace.datasets[index];

  $: rootPath = dataSets.rootPath.split("\\").slice(-3).join("\\");
</script>

<ParamRecord {focus} {isFocus} {del} target={{ cat: "dataset", index }}>
  <span>
    <span>{"$"}</span>
    <span class="name">{dataSets.varName}</span>
    <span>&nbsp;{"["}</span>
    <span class="method">
      {dataSets.scanOption == undefined ? "all" : "choice"}
    </span>
    <span>{"] "}</span>
    <span class="root">{rootPath}</span>
  </span>
</ParamRecord>

<style>
  span {
    font-size: 0;
    * {
      font-size: 16px;
      font-weight: 400;
      color: rgba(255, 255, 255, 0.635);
    }
  }
  .method {
    color: rgb(255, 175, 70);
    font-style: italic;
  }
  .name {
    color: rgb(119, 255, 92);
  }
  .root {
    color: rgb(255, 255, 255);
  }
</style>
