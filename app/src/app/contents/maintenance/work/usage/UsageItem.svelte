<script lang="ts">
  export let name: string;
  export let type: string;

  $: records = (() => {
    const str = type.replaceAll("{", "{\n").replaceAll(";", ";\n");
    const list = str.split("\n").map(r => r.trim());
    let indent = 0;
    list.forEach((r, i) => {
        if(r.indexOf('}') !== -1) indent --;
        list[i] = '　'.repeat(indent) + r;
        if(r.indexOf('{') !== -1) indent ++;
    });
    return list;
  })();
</script>

<div class="record">
  <span class="name">${name}</span>
  <span>{":"}&nbsp;</span>
  <span>{records[0]}</span>
</div>
{#if records.length > 1}
  {#each records.slice(1) as r}
    <div class="record">
      <span>{r}</span>
    </div>
  {/each}
{/if}

<style>
  .record {
    display: inline-block;
    position: relative;
    width: 100%;
    /* margin-top: 1px; */
    background-color: rgba(255, 255, 255, 0.116);
    padding-left: 4px;
    box-sizing: border-box;
  }
  span {
    font-size: 18px;
    font-weight: 400;
    color: rgba(255, 252, 199, 0.665);
  }
  .name {
    color: rgb(145, 255, 108);
    font-style: italic;
  }
</style>
