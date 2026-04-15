<script lang="ts">
  import store from "../../../store/store";
  import StoreProject from "../../../store/storeWorkspace";
  import Cover from "../../../util/layout/Cover.svelte";
  import Hover from "../../../util/layout/Hover.svelte";
  import Record from "../../../util/layout/RecordDiv.svelte";
  import Wrap from "../../../util/layout/Wrap.svelte";
  import AddDelButton from "../AddDelButton.svelte";

  export let focus: () => void;
  export let isFocus: boolean;
  export let del: () => void;
  export let contextmenu: () => void = () => {};

  export let target: StoreProject.Target;

  $: onclick = () => {
    if (!isFocus) focus();
    else $store.target = null;
  };
  $: oncontextmenu = () => {
    focus();
    contextmenu();
  };

  $: isDisable = (() => {
    return (
      $store.disables.find(
        (d) => d.cat === target.cat && d.index === target.index,
      ) != undefined
    );
  })();
</script>

<Record height={56}>
  <Wrap margin={1}>
    <button class="label" {onclick} {oncontextmenu} data--disable={isDisable}>
      <Record height={30} padding={"5px 0 0 2px"} nowrap>
        <slot />
      </Record>
      <Record height={20} padding={"0 0 0 4px"}>
        <span data--disable={isDisable}>{!isDisable ? "enable" : "error"}</span>
      </Record>
      <Hover />
      {#if isFocus}
        <Cover />
      {/if}
    </button>
    <AddDelButton del callback={del} />
  </Wrap>
</Record>

<style>
  .label {
    display: inline-block;
    position: relative;
    width: calc(100% - 40px);
    height: 100%;
    overflow: hidden;
    padding: 0;
    /* padding: 0 4px;
    box-sizing: border-box; */
    text-align: left;
    background-color: rgb(98, 98, 108);
    vertical-align: top;
    /* box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.05),
      0 8px 24px rgba(0, 0, 0, 0.3); */
    /* overflow: hidden;
    white-space: nowrap; */

    /* border: 2px solid rgb(14, 255, 34); */

    border-radius: 2px;
  }
  .label[data--disable="true"] {
    background-color: rgba(255, 0, 0, 0.1);
    /* border: 2px solid rgba(255, 6, 6, 0.364); */
  }

  span {
    font-size: 14px;
    font-weight: 400;
    line-height: 16px;
    padding: 0 4px;
    border-radius: 2px;
    color: rgba(177, 255, 177, 0.683);
    background-color: rgba(177, 255, 0, 0.203);
  }
  span[data--disable="true"] {
    color: rgb(253, 95, 95);
    background-color: rgba(230, 0, 0, 0.203);
  }
</style>
