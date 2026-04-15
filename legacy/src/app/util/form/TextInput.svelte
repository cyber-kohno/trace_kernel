<script lang="ts">
  export let requied = false;
  export let readonly = false;
  export let width: string = "100px";
  export let value: string;
  export let set: (value: string) => void = () => {};

  export let invalidValues: string[] = [];
  export let allowedPattern: RegExp | null = null;

  export let error: boolean = false;
  $: {
    if (invalidValues.length > 0) {
      error = invalidValues.find((d) => d === value) != undefined;
    }
    if (allowedPattern) {
      error = !allowedPattern.test(value);
    }
  }
</script>

<input
  type="text"
  style:width
  {value}
  oninput={(e) => {
    const value = e.currentTarget.value;
    set(value);
  }}
  {readonly}
  data--readonly={readonly}
  data--error={error}
  data--blank={requied && value === ""}
/>

<style>
  input {
    display: inline-block;
    position: relative;
    margin: 5px 0 0 2px;
    height: 20px;
    background-color: #d8d8d8;
    border: 1px solid #888;
    box-sizing: border-box;
    border-radius: 2px;
    font-size: 14px;
    outline: none;
  }
  input[data--error="true"] {
    background-color: rgb(255, 130, 130);
  }
  input[data--blank="true"] {
    background-color: #ff0;
  }
  input[data--readonly="true"] {
    color: rgb(0, 0, 184);
    background-color: #d2d2d2;
  }
</style>
