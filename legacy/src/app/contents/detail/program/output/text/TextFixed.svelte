<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import OperationButton from "../../../../../util/button/OperationButton.svelte";
  import ToastUtil from "../../../../../util/item/toastUtit";

  export let channelId: string;
  export let total: number;
</script>

<OperationButton
  name={"Clipboad"}
  width={140}
  callback={async () => {
    const lines = await invoke<string[]>("get_range_lines", {
      workerId: "a",
      channelId,
      from: 0,
      to: total,
    });
    navigator.clipboard.writeText(lines.join("\n"));
    ToastUtil.disp({
      text: "Copied the output to the clipboard!",
    });
  }}
/>
