<script lang="ts">
  export let del: boolean = false;
  export let callback: () => void;
</script>

<div class="wrap">
  <button class="adddel" onclick={callback}>{!del ? "+" : "-"}</button>
</div>

<style>
  .wrap {
    display: inline-block;
    position: relative;
    width: 40px;
    height: 100%;
    /* background-color: #ffff0055; */
    box-sizing: border-box;
    color: #006;
    font-size: 18px;
    font-weight: 600;
    text-align: left;
    vertical-align: top;
  }
  button {
    display: inline-block;
    position: relative;
    width: calc(100% - 4px);
    margin: 1px 0 0 2px;
    height: 24px;
    background-color: #91919150;
    box-sizing: border-box;
    border-radius: 2px;
    color: #d0d0d0;
    font-size: 18px;
    font-weight: 400;
    line-height: 16px;
    /* border: 1px solid #aaaaaa68; */
    box-sizing: border-box;
    text-align: center;
    vertical-align: top;
    &:hover {
      opacity: 0.7;
    }
  }
</style>
