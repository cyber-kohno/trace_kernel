<script lang="ts">
  import MDProcess from "./MDProcess.svelte";
  import MDEnv from "./MDEnv.svelte";
  import MDResourece from "./MDResourece.svelte";
  import MDWork from "./work/MDWork.svelte";
  import type storeWorkspace from "../../store/storeWorkspace";
  import MDDataset from "./dataset/MDDataset.svelte";

  export let target: storeWorkspace.Target;
</script>

{#if target.cat === "env"}
  <MDEnv />
{:else if target.cat === "resource"}
  <MDResourece />
{:else if target.cat === "dataset"}
  <MDDataset />
{:else if target.cat === "process"}
  <MDProcess />
{:else if target.cat === "work"}
  <MDWork />
{/if}
