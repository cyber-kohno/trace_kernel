<script lang="ts">
    import type TxExecuter from "../util/txExecuter";


  export let phase: TxExecuter.Phase;
</script>

<div class="wrap">
  <div data--active={phase === "confirm"}>{"confirm"}</div>
  <div>{">"}</div>
  <div data--active={phase === "verify"}>{"verify"}</div>
  <div>{">"}</div>
  <div data--active={phase === "commit"}>{"commit"}</div>
</div>

<style>
  .wrap {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    background-color: rgb(0, 0, 0);
    text-align: center;
    padding: 0 4px 0 0;
    box-sizing: border-box;

    * {
      display: inline-block;
      position: relative;
      font-size: 18px;
      font-weight: 600;
      line-height: 26px;
      margin-left: 8px;
      color: rgba(255, 128, 50, 0.561);
    }
    *[data--active="true"] {
      color: rgb(255, 128, 50);
    }
  }
</style>
