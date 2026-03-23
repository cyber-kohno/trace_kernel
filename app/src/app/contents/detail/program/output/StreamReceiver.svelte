<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import Record from "../../../../util/layout/RecordDiv.svelte";

  let ref: HTMLDivElement;

  export let channelId: string;

  export let recordHeight: number;
  export let fixedAreaHeight: number;

  let isEnd = false;

  let total = 0;
  let isTracking = true;
  let hasNewLine = false;

  let lines: string[] = [];
  let start: number = 0;
  let fetching = false;
  let fetchReserve = false;

  export const init = () => {
    ref.scrollTop = 0;
    isTracking = true;
  };

  export const receiveStream = async () => {
    if (!isTracking) {
      hasNewLine = true;
      return;
    }
    hasNewLine = false;
    total = await invoke<number>("get_line_len", { workerId: "a", channelId });
    if (ref == undefined) throw new Error();
    ref.scrollTop = ref.scrollHeight;
    fetchLines();
  };

  const fetchLines = () => {
    fetchReserve = false;
    if (fetching) {
      fetchReserve = true;
      return;
    }
    fetching = true;
    if (ref == undefined) throw new Error();
    const { height } = ref.getBoundingClientRect();
    const scrollTop = ref.scrollTop;
    const from = Math.floor(scrollTop / recordHeight);
    let to = from + Math.floor(height / recordHeight) + 1;
    if (to > total) to = total;
    start = from;
    // console.log({
    //   scrollTop,
    //   height,
    //   from,
    //   to,
    //   total,
    // });

    // console.log(`from: ${from} - to: ${to}`);
    invoke<string[]>("get_range_lines", {
      workerId: "a",
      channelId,
      from,
      to,
    }).then((res) => {
      // console.log(res);
      lines = res;
      fetching = false;
      // 予約があればもう一回
      if (fetchReserve) fetchLines();
    });
  };

  export const end = () => (isEnd = true);

  $: resumeTracking = () => (isTracking = false);
  $: activeTracking = () => {
    isTracking = true;
    // 終わっていたら残りを受信する
    if (isEnd) {
      receiveStream();
    }
  };
</script>

<Record height={fixedAreaHeight}>
  <slot name="fixed" {total} />
</Record>
<Record surplus={fixedAreaHeight}>
  <div
    class="wrap"
    bind:this={ref}
    role="button"
    tabindex="0"
    onscroll={fetchLines}
    onclick={resumeTracking}
    onkeydown={(e) => e.key === "Enter" && resumeTracking()}
    data--end={isEnd}
  >
    <div class="frame" style:height="{total * recordHeight}px">
      {#each lines as record, i}
        <div
          class="record"
          style:height="{recordHeight}px"
          style:top="{recordHeight * (i + start)}px"
        >
          <slot name="record" {record} index={start + i} />
        </div>
      {/each}
    </div>
  </div>
  {#if hasNewLine}
    <div
      class="newlen"
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === "Enter" && activeTracking()}
      onclick={activeTracking}
    >
      {"New record available."}
    </div>
  {/if}
</Record>

<style>
  .wrap {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    background-color: rgb(0, 90, 36, 0.771);
    overflow: auto;
    border: 1px solid rgb(72, 127, 178);
    box-sizing: border-box;
  }
  .wrap[data--end="true"] {
    background-color: rgba(0, 45, 90, 0.771);
  }
  .frame {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
  }
  .record {
    display: inline-block;
    position: absolute;
    left: 0;
    top: 0;
    z-index: 2;
    width: 100%;
  }
  .newlen {
    display: inline-block;
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%); /* ← これを追加 */
    padding: 0 20px;
    background-color: rgba(255, 217, 0, 0.781);
    font-size: 22px;
    line-height: 36px;
    font-weight: 400;
    color: rgb(0, 0, 0);
    border-radius: 4px;
    z-index: 6;
  }
</style>
