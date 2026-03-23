<script lang="ts">
  export let width: number = 50;
  export let surplus: number | null = null;
  const widthValue = surplus == null ? `${width}px` : `calc(100% - ${surplus}px)`;
</script>

<div style:width={widthValue}><slot /></div>

<style>
  div {
    display: inline-block;
    position: relative;
    height: 100%;
    /* background-color: #8888aa22; */
    box-sizing: border-box;
    vertical-align: top;
  }
</style>
