<script lang="ts">
  export let prefix: string;
  export let item: string;
</script>

<div class="record">
  <span class="prefix">{`${prefix}.`}</span>
  <span class="item">{item}</span>
</div>

<style>
  .record {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 22px;
    margin: 1px 0 0 0;
    background-color: rgba(156, 170, 179, 0.249);
    padding: 0 0 0 4px;
    border-radius: 2px;
    /* border: 1px solid #ffffff72; */
    box-sizing: border-box;

    span {
      font-size: 16px;
      font-weight: 400;
      line-height: 20px;
    }
  }

  .prefix {
    color: #e3fc66;
  }
  .item {
    color: #6cff4f;
  }
</style>
