<script lang="ts">
  import { writable } from "svelte/store";
  import type ToastUtil from "./toastUtit";
  import { fade } from "svelte/transition";

  let toast = writable<ToastUtil.Props | null>(null);

  export const disp = (props: ToastUtil.Props) => {
    $toast = props;
    setTimeout(() => {
      $toast = null;
    }, $toast.sustainMs ?? 1000);
  };

  $: duration = $toast?.sustainMs ?? 1000;
</script>

{#if $toast != null}
  <div out:fade={{ duration: 1000 }}>
    {$toast.text}
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
