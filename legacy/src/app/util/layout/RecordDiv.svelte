<script lang="ts">
  export let height = 30;
  export let rate: number | null = null;
  export let surplus: number | null = null;
  export let align: "left" | "center" | "right" = "left";
  export let bgColor: string = "transparent";
  export let padding: string = "none";
  export let nowrap: boolean = false;

  $: heightValue = (() => {
    let heightValue =
      surplus == null ? `${height}px` : `calc(100% - ${surplus}px)`;
    if (rate != null) heightValue = `${rate}%`;
    return heightValue;
  })();
</script>

<div
  style:height={heightValue}
  style:text-align={align}
  style:background-color={bgColor}
  style:padding
  data--nowrap={nowrap}
>
  <slot />
</div>

<style>
  div {
    display: inline-block;
    position: relative;
    width: 100%;
    box-sizing: border-box;
  }
  div[data--nowrap="true"] {
    overflow-x: hidden;
    white-space: nowrap;
  }
</style>
