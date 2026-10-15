<script lang="ts">
  export let zIndex: number;
  export let bgColor: string;
</script>

<div style:z-index={zIndex} style:background-color={bgColor}>
  <slot />
</div>

<style>
  div {
    display: inline-block;
    position: absolute;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.398);
    z-index: 5;
    left: 0;
    top: 0;
    backdrop-filter: blur(10px);
  }
</style>
