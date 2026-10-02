<script lang="ts">
  import { fade } from 'svelte/transition';
  import { toastStore } from '../../state/store';

  $: duration = $toastStore?.sustainMs ?? 1000;
</script>

{#if $toastStore != null}
  <div out:fade={{ duration: 1000 }}>
    {$toastStore.text}
  </div>
{/if}

<style>
  div {
    display: inline-block;
    position: absolute;
    left: 20px;
    top: 20px;
    height: 40px;
    padding: 0 20px;
    background-color: rgba(255, 0, 81, 0.623);
    font-size: 22px;
    line-height: 36px;
    font-weight: 400;
    color: rgb(255, 255, 255);
    border-radius: 4px;
    z-index: 8;
  }
</style>
