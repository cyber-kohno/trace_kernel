<script lang="ts">
  import workspaceStore from "../../../store/workspace-store";
  import uiStore from "../../../store/ui-store";
  import StoreProject from "../../../store/store-workspace";
  import ToastUtil from "../../../util/item/toast-util";
  import EntryRecord from "./EntryRecord.svelte";

  export let index: number;

  $: workspace = StoreProject.getWorkspace($workspaceStore);

  $: validate = () => {
    const target = StoreProject.getTarget();
    StoreProject.validate(target);
  };

  $: isFocus = (() => {
    const target = $uiStore.target;
    return target != null && target.cat === "work" && target.index === index;
  })();

  $: focus = () => {
    $uiStore.target = { cat: "work", index };
  };

  $: del = () => {
    workspace.works.splice(index, 1);
    workspace.works = workspace.works.slice();
    $uiStore.target = null;
    $workspaceStore.workspace = { ...workspace };
    validate();
  };

  $: works = workspace.works[index];

  $: openProgram = () => {
    const target = StoreProject.getTarget();
    const hasDisable = StoreProject.hasDisable(target);
    if (hasDisable)
      ToastUtil.disp({ text: "This work has an error and cannot be opened." });
    else $uiStore.dialog = "program";
  };
</script>

<EntryRecord
  {focus}
  {isFocus}
  {del}
  contextmenu={openProgram}
  target={{ cat: "work", index }}
>
  <span>
    <span class="key">{works.name}</span>
  </span>
</EntryRecord>

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
