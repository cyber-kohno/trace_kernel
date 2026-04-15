<script lang="ts">
  export let name: string;
  export let width = 0;
</script>

<button style:width={width === 0 ? "none" : `${width}px`}>{name}</button>

<style>
  button {
    display: inline-block;
    position: relative;
    background-color: rgba(190, 212, 255, 0.311);
    height: 24px;
    margin: 3px 0 0 4px;
    padding: 0 12px;
    box-sizing: border-box;
    color: #a8a8a8;
    font-size: 18px;
    line-height: 24px;
    font-weight: 600;
    text-align: center;
    /* border: 1px solid #a8a8a8; */
    border-radius: 0 4px 4px 0;
  }
</style>
