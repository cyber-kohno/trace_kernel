<script lang="ts">
  import type TxExecuter from "../../util/txExecuter";

  export let status: TxExecuter.Status;

  $: message = (() => {
    const { verify, commit } = status;
    if (verify) {
      if (verify.kind !== "checked") return verify.message;
    }
    if (commit) {
      if (commit.kind !== "success") return commit.detail;
    }
    return null;
  })();
</script>

{#if message}
  <div class="msg">{message}</div>
{/if}

<style>
  .msg {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 22px;
    /* background-color: rgba(204, 129, 230, 0.349); */

    font-size: 14px;
    font-weight: 500;
    color: rgb(255, 78, 78);
  }
</style>
