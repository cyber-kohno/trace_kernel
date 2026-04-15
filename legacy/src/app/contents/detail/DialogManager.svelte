<script lang="ts">
  import store from "../../store/store";
  import Record from "../../util/layout/RecordDiv.svelte";
    import DeclareDialog from "./declare/DeclareDialog.svelte";
  import ProgramDialog from "./program/ui/ProgramDialog.svelte";
  import SettingDialog from "./setting/SettingDialog.svelte";

  $: dialog = $store.dialog;
</script>

{#if dialog != undefined}
  <div class="blind">
    {#if dialog === "program"}
      <ProgramDialog />
    {:else if dialog === "declare"}
      <DeclareDialog />
    {:else if dialog === "setting"}
      <SettingDialog />
    {/if}
  </div>
{/if}

<style>
  .blind {
    display: inline-block;
    position: absolute;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 255, 255, 0.367);
    z-index: 5;
    left: 0;
    top: 0;
    backdrop-filter: blur(10px);
  }
</style>
