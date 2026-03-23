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
    return (
      target != null && target.cat === "resource" && target.index === index
    );
  })();

  $: focus = () => {
    $store.target = { cat: "resource", index };
  };

  $: del = () => {
    workspace.resources.splice(index, 1);
    workspace.resources = workspace.resources.slice();
    $store.target = null;
    $store.workspace = { ...workspace };
    validate();
  };

  $: resource = workspace.resources[index];
</script>

<ParamRecord {focus} {isFocus} {del} target={{ cat: "resource", index }}>
  <span class="wrap">
    <span>{"$"}</span>
    <span class="name">{resource.varName}</span>
  </span>
</ParamRecord>

<style>
  .wrap {
    font-size: 0;
    * {
      font-size: 16px;
      font-weight: 400;
      color: rgba(255, 255, 255, 0.635);
    }
  }
  .name {
    color: rgb(119, 255, 92);
  }
</style>
