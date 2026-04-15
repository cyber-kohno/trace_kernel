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
    return target != null && target.cat === "process" && target.index === index;
  })();

  $: focus = () => {
    $store.target = { cat: "process", index };
  };

  $: del = () => {
    workspace.processes.splice(index, 1);
    workspace.processes = workspace.processes.slice();
    $store.target = null;
    $store.workspace = { ...workspace };
    validate();
  };

  $: process = workspace.processes[index];
  $: prgPath = process.prgPath.split("\\").slice(-3).join("\\");
</script>

<ParamRecord {focus} {isFocus} {del} target={{ cat: "process", index }}>
  <span>
    <span>{"%"}</span>
    <span class="key">{process.funcName}</span>
    <span>{"%: "}</span>
    <span class="command">{prgPath}</span>
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
  .key {
    color: rgb(255, 255, 151);
    font-style: italic;
  }
  .command {
    color: rgb(255, 255, 255);
  }
</style>
