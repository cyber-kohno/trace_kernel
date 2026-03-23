<script lang="ts">
  export let requied = false;
  export let optional = false;
  export let value: number | undefined;
  export let set: (value: number) => void;
  export let min: number = -65536;
  export let max: number = 65536;

  $: getValue = () => {
    return (value ?? '').toString();
  };
</script>

<input
  type="number"
  {min}
  {max}
  value={getValue()}
  oninput={(e) => {
    const v = e.currentTarget.value;
    let value: number | undefined = 0;
    if (optional && v === "") {
      value = undefined;
    } else if (!optional || v !== "") {
      value = Number.parseInt(v);
    }
    set(value as number);
  }}
  data--blank={requied && getValue() === ''}
/>

<style>
  input {
    display: inline-block;
    position: relative;
    margin: 5px 0 0 2px;
    height: 20px;
    width: 80px;
    background-color: #d8d8d8;
    border: 1px solid #888;
    box-sizing: border-box;
    border-radius: 2px;
    font-size: 14px;
    outline: none;
  }
  input[data--blank="true"] {
    background-color: #ff0;
  }
</style>
