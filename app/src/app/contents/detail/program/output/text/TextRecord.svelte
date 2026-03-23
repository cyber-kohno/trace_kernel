<script lang="ts">
  export let record: string;
  export let index: number;
</script>

<div class="row">{index + 1}</div>
<div class="text">{record}</div>

<style>
  .row {
    display: inline-block;
    position: relative;
    width: 80px;
    height: 100%;
    background-color: rgb(33, 102, 102);
    color: white;
    font-size: 16px;
    line-height: 22px;
    padding-left: 4px;
    vertical-align: top;
    box-sizing: border-box;
  }
  .text {
    display: inline-block;
    position: relative;
    width: calc(100% - 80px);
    /* width: 200px; */
    height: 100%;
    color: white;
    font-size: 16px;
    line-height: 22px;
    padding-left: 4px;
    box-sizing: border-box;
    /* background-color: rgb(33, 102, 102); */
    /* font-family: monospace; */
    white-space: pre;
    vertical-align: top;
  }
</style>
