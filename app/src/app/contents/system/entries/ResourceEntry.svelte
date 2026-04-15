<script lang="ts">
  import workspaceStore from "../../../store/workspace-store";
  import uiStore from "../../../store/ui-store";
  import StoreProject from "../../../store/store-workspace";
  import EntryRecord from "./EntryRecord.svelte";

  export let index: number;

  $: workspace = StoreProject.getWorkspace($workspaceStore);
  $: validate = () => {
    const target = StoreProject.getTarget();
    StoreProject.validate(target);
  };

  $: isFocus = (() => {
    const target = $uiStore.target;
    return (
      target != null && target.cat === "resource" && target.index === index
    );
  })();

  $: focus = () => {
    $uiStore.target = { cat: "resource", index };
  };

  $: del = () => {
    workspace.resources.splice(index, 1);
    workspace.resources = workspace.resources.slice();
    $uiStore.target = null;
    $workspaceStore.workspace = { ...workspace };
    validate();
  };

  $: resource = workspace.resources[index];
</script>

<EntryRecord {focus} {isFocus} {del} target={{ cat: "resource", index }}>
  <span class="wrap">
    <span>{"$"}</span>
    <span class="name">{resource.varName}</span>
  </span>
</EntryRecord>

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
