<script lang="ts">
  export let name;
  export let sub: string | null = null;
</script>

<div>
  <span class="main">{`${name}`}</span>
  {#if sub != null}
    <span class="sub">&nbsp;&nbsp;*{sub}</span>
  {/if}
</div>

<style>
  div {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 30px;
    /* background-color: rgba(255, 255, 255, 0.173); */
    box-sizing: border-box;
    margin: 5px 0 0 0;
    text-align: left;
    padding: 0 0 0 4px;
    * {
      font-size: 18px;
      font-weight: 600;
    }
  }
  .main {
    color: rgba(152, 174, 202, 0.743);
  }
  .sub {
    color: rgba(239, 246, 255, 0.439);
  }
</style>
