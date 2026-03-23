<script lang="ts">
  import { SourceMapConsumer, type NullableMappedPosition } from "source-map";
  import mappingsWasm from "source-map/lib/mappings.wasm?url";

  let exceptionMsg: string;
  let dispLines: string[];
  let targetIndex: number = -1;

  let sourceMapReady = false;

  export const init = async (
    sourceMap: string,
    stack: string,
    tsCode: string,
    setRuntimeErrorMarker: (pos: NullableMappedPosition, msg: string) => void,
  ) => {
    async function ensureSourceMap() {
      if (sourceMapReady) return;
      (SourceMapConsumer as any).initialize({
        "lib/mappings.wasm": mappingsWasm,
      });
      sourceMapReady = true;
    }

    await ensureSourceMap();
    const consumer = await new SourceMapConsumer(sourceMap); //line: 126

    const evalMatch = stack.match(/<anonymous>:(\d+):(\d+)/); // JS line:col
    if (evalMatch) {
      const jsLine = Number(evalMatch[1]);
      const jsCol = Number(evalMatch[2]);

      const pos = consumer.originalPositionFor({
        line: jsLine - 2,
        column: jsCol,
      });

      exceptionMsg = stack.split("\n")[0];
      setRuntimeErrorMarker(pos, exceptionMsg);

      targetIndex = (pos.line as number) - 1;
      const tsCodeLines = tsCode.split("\n");
      dispLines = [];
      for (let i = 0; i < 5; i++) {
        dispLines.push(tsCodeLines[targetIndex - 2 + i] ?? "");
      }
    }

    consumer.destroy();
  };

  const getLine = (lineNum: number) => {
    const num = -1 + targetIndex + lineNum;
    return `${num >= 1 ? num : ""}`;
  };
</script>

<div class="msg">{exceptionMsg}</div>
{#each dispLines as record, i}
  <div class="record">
    <span class="line">{getLine(i)}</span>
    <span class="code" data--target={i === 2}>{record}</span>
  </div>
{/each}

<style>
  .msg {
    display: inline-block;
    position: relative;
    width: 100%;
    /* height: 30px; */
    font-size: 18px;
    background-color: rgb(31, 0, 0);
    color: rgb(255, 141, 141);
    font-weight: 600;
    /* overflow: hidden;
    white-space: nowrap; */
    padding: 0 0 4px 4px;
    box-sizing: border-box;
  }
  .record {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 30px;
    * {
      font-size: 18px;
      vertical-align: top;
      display: inline-block;
      position: relative;
      height: 100%;
      padding-left: 4px;
      box-sizing: border-box;
    }
  }
  .line {
    width: 40px;
    background-color: rgba(93, 161, 111, 0.407);
    color: rgb(255, 255, 255);
  }
  .code {
    color: white;
    background-color: rgb(92, 0, 0);
    width: calc(100% - 40px);
    font-weight: 400;
    overflow: hidden;
    white-space: nowrap;
  }
  [data--target="true"] {
    text-decoration: wavy underline;
    text-decoration-color: #f00;
    background-color: rgba(160, 57, 57, 0.755);
  }
</style>
