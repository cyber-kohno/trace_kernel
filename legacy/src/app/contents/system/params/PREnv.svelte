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
    return target != null && target.cat === "env" && target.index === index;
  })();

  $: focus = () => {
    $store.target = { cat: "env", index };
  };

  $: del = () => {
    workspace.envs.splice(index, 1);
    workspace.envs = workspace.envs.slice();
    $store.target = null;
    $store.workspace = { ...workspace };
    validate();
  };

  $: envVar = workspace.envs[index];
</script>

<ParamRecord {focus} {isFocus} {del} target={{ cat: "env", index }}>
  <span>
    <span>{"%"}</span>
    <span class="key">{envVar.varName}</span>
    <span>{"%: "}</span>
    <span class="value">{envVar.value}</span>
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
  .value {
    color: rgb(255, 255, 255);
  }
</style>
