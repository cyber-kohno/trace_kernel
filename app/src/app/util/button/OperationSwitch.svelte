<script lang="ts">
  export let isDisable: boolean = false;
  export let name: string;
  export let callback: () => void = () => {};
  export let width = 0;
  export let isActive = false;
</script>

<button
  data--active={isActive}
  data--disable={isDisable}
  onclick={callback}
  style:width={width === 0 ? "none" : `${width}px`}>{name}</button
>

<style>
  button {
    display: inline-block;
    position: relative;
    background-color: rgb(85, 103, 112);
    height: 24px;
    margin: 3px 0 0 4px;
    padding: 0 12px;
    box-sizing: border-box;
    color: #a8a8a8;
    font-size: 18px;
    line-height: 24px;
    font-weight: 600;
    border: 1px solid #a8a8a8;
    border-radius: 4px;

    /* &:hover {
      background-color: rgb(218, 241, 212);
    } */
  }
  button[data--active="true"] {
    background-color: rgb(76, 134, 163);
  }
  button[data--disable="true"] {
    opacity: 0.4;
    pointer-events: none;
  }
</style>
