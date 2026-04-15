<script lang="ts">
  export let bgColor: string = "#transparent";
  export let margin: number = 4;
</script>

<div
  style:background-color={bgColor}
  style:margin={`${margin}px 0 0 ${margin}px`}
  style:width={`calc(100% - ${margin * 2}px)`}
  style:height={`calc(100% - ${margin * 2}px)`}
>
  <slot />
</div>

<style>
  div {
    display: inline-block;
    position: relative;
    overflow: auto;
  }
</style>
