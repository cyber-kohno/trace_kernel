<script lang="ts">
  export let isDisable: boolean = false;
  export let name: string;
  export let callback: () => void = () => {};
  export let isLineup = false;
  export let width = 0;
  export let bgColor: string = "rgba(184, 186, 202, 0.6)";
  export let tooltip: string | null = null;
</script>

<button
  data--disable={isDisable}
  data--lineup={isLineup}
  onclick={callback}
  style:width={width === 0 ? "none" : `${width}px`}
  style:background-color={bgColor}
  { ...(tooltip ? { title: tooltip } : {}) } 
>{name}</button>

<style>
  button {
    display: block;
    position: relative;
    height: 24px;
    margin: 3px 0 0 4px;
    padding: 0 12px;
    box-sizing: border-box;
    color: rgb(46, 65, 91);
    font-size: 18px;
    line-height: 24px;
    font-weight: 600;
    border: 1px solid rgb(46, 65, 91);
    border-radius: 2px;
    text-align: center;

    &:hover {
      /* background-color: rgb(84, 86, 102); */
      opacity: 0.81;
    }
  }
  button[data--disable="true"] {
    opacity: 0.4;
    pointer-events: none;
  }
  button[data--lineup="true"] {
    display: inline-block;
    margin: 3px 4px 0 0;
  }
</style>
