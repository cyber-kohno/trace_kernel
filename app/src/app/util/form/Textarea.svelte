<script lang="ts">
  export let value: string;
  export let set: (v: string) => void = () => {};
  export let readonly: boolean = false;
  export let disable: boolean = false;
  export let bgColor: string = '#d8d8d8';

</script>

<textarea
  {value}
  oninput={(e) => set(e.currentTarget.value)}
  {readonly}
  data--readonly={readonly}
  data--disable={disable}
  style:background-color={bgColor}
></textarea>

<style>
  textarea {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    resize: none;
    outline: none;
    box-sizing: border-box;
    border: none;
    font-size: 14px;
    background-color: #d8d8d8;
    color: #000000;
  }
  textarea[data--readonly="true"] {
    color: #c0ceff;
  }
  textarea[data--disable="true"] {
    opacity: 0.6;
    pointer-events: none;
  }
</style>
