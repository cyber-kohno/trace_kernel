<script lang="ts">
  export let rate;
</script>

<div class="wrap">
  <div class="frame">
    <div class="inner" style:width={`${rate}%`}></div>
  </div>
</div>

<style>
  .wrap {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 30px;
    background-color: rgba(9, 151, 45, 0.38);
  }
  .frame {
    display: inline-block;
    position: relative;
    /* border: solid 1px #949494;
    box-sizing: border-box; */
    margin: 4px 0 0 10px;
    width: calc(100% - 20px);
    height: calc(100% - 8px);
    background-color: rgb(0, 0, 0);
  }
  .inner {
    display: inline-block;
    position: relative;
    height: 100%;
    background-color: rgb(255, 250, 225);
  }
</style>
