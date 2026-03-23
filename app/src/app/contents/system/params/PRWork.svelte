<script lang="ts">
  import store from "../../../store/store";
  import StoreProject from "../../../store/storeWorkspace";
  import ToastUtil from "../../../util/item/toastUtit";
  import ParamRecord from "./ParamRecord.svelte";

  export let index: number;

  $: workspace = StoreProject.getWorkspace($store);

  $: validate = () => {
    const target = StoreProject.getTarget($store);
    StoreProject.validate(target);
  };

  $: isFocus = (() => {
    const target = $store.target;
    return target != null && target.cat === "work" && target.index === index;
  })();

  $: focus = () => {
    $store.target = { cat: "work", index };
  };

  $: del = () => {
    workspace.works.splice(index, 1);
    workspace.works = workspace.works.slice();
    $store.target = null;
    $store.workspace = { ...workspace };
    validate();
  };

  $: works = workspace.works[index];

  $: openProgram = () => {
    const target = StoreProject.getTarget($store);
    const hasDisable = StoreProject.hasDisable(target);
    if (hasDisable)
      ToastUtil.disp({ text: "This work has an error and cannot be opened." });
    else $store.dialog = "program";
  };
</script>

<ParamRecord
  {focus}
  {isFocus}
  {del}
  contextmenu={openProgram}
  target={{ cat: "work", index }}
>
  <span>
    <span class="key">{works.name}</span>
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
    color: rgb(238, 139, 255);
    font-style: italic;
  }
</style>
