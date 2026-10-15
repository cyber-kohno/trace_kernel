<script lang="ts">
  export let item: string;
</script>

<div class="record">
  <span class="item">{item}</span>
</div>

<style>
  .record {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 22px;
    margin: 1px 0 0 0;
    background-color: rgba(240, 215, 235, 0.144);
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

  .item {
    color: #e3fc66;
  }
</style>
