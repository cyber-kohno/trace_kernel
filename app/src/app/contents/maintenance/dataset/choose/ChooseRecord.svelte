<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import type StoreDataset from "../../../../store/storeDataset";

  export let item: StoreDataset.NodeDispProps;
  export let dir: string | null = null;

  export let invalidate: ()=>void;

  $: toggleOpen = () => {
    const child = item.node.child;
    if (child == undefined) throw new Error();
    child.isOpen = !child.isOpen;
    invalidate();
  };
  $: toggleSelect = () => {
    const child = item.node.child;
    if (child != undefined) throw new Error();
    item.node.isSelected = !item.node.isSelected;
    invalidate();
  };
  $: toggleUse = () => {
    const child = item.node.child;
    if (child == undefined) throw new Error();
    const rec = (node: StoreDataset.UsableNode, isSelect: boolean) => {
      if (node.child == undefined) node.isSelected = isSelect;
      else node.child.nodes.forEach((n) => rec(n, isSelect));
    };
    if (child.selectCnt == child.fileCnt) rec(item.node, false);
    else rec(item.node, true);
    invalidate();
  };

  $: dispFile = () => {
    if (item.node.child != undefined) return;
    // alert(item.node.path);
    invoke("read_file", { req: { filePath: item.node.path } }).then((str) => {
      let language = "";
      const fileName = item.node.name;
      const dot = fileName.lastIndexOf(".");
      const extention = dot !== -1 ? fileName.slice(dot + 1) : "";
      switch (extention) {
        case "java":
          language = "java";
          break;
      }
      // $store.preview = {
      //   language,
      //   src: str as string,
      // };
    });
  };

  $: child = item.node.child;
</script>

<div class="wrap" style:top="{item.seq * 25}px">
  {#each item.indents as indent, i}
    <div class="indent">
      {#if indent !== "none"}
        <div class="inner" data--indent={indent}></div>
        {#if i === item.indents.length - 1}
          <div class="branch"></div>
        {/if}
      {/if}
    </div>
  {/each}
  <!-- 対象ボタン（Dir or File） -->
  <button
    class="type"
    data--file={child == null}
    data--select={item.node.isSelected}
    data--use={(() => {
      if (child == null) return "";
      else if (child.selectCnt == child.fileCnt) return "all";
      else if (child.selectCnt > 0) return "some";
      else if (child.selectCnt === 0) return "none";
    })()}
    onclick={child == null ? toggleSelect : toggleUse}
  >
    {child == null ? "FILE" : "DIR"}
  </button>
  {#if child != undefined && child.nodes.length > 0}
    <button class="open" onclick={toggleOpen}>{child.isOpen ? "-" : "+"}</button
    >
  {/if}
  {#if dir != null}
    <div class="dir">
      {dir}
    </div>
  {/if}
  <a
    class="str"
    data--file={child == null}
    data--dirmode={dir == null}
    oncontextmenu={dispFile}
  >
    {item.node.name}
  </a>
  {#if child != undefined}
    <div class="filecnt">{`[${child.selectCnt}/${child.fileCnt}]`}</div>
  {/if}
</div>

<style>
  .wrap {
    display: inline-block;
    position: absolute;
    left: 0;
    min-width: 100%;
    height: 24px;
    background-color: #aaccff05;
    white-space: nowrap;

    &:hover {
      background-color: #bbdd0005;
    }

    * {
      vertical-align: top;
    }
  }
  .indent {
    display: inline-block;
    position: relative;
    height: 100%;
    background-color: #ccccccaa;
    width: 30px;
  }
  .inner {
    display: inline-block;
    position: absolute;
    top: 0;
    left: 12px;
    background-color: #aaffaa;
    width: 5px;
  }
  .inner[data--indent="middle"] {
    height: 24px;
  }
  .inner[data--indent="last"] {
    height: 12px;
  }
  .branch {
    display: inline-block;
    position: absolute;
    top: 10px;
    left: 12px;
    background-color: #aaffaa;
    width: 18px;
    height: 5px;
  }
  button.open {
    display: inline-block;
    position: relative;
    width: 40px;
    height: calc(100% - 4px);
    background-color: #fff;
    box-sizing: border-box;
    border-radius: 2px;
    margin: 2px 0 0 2px;
    color: #222;
    font-size: 14px;
    font-weight: 400;
    border: 1px solid #338;
    text-align: center;
    &:hover {
      background-color: #ff5;
    }
  }
  button.type {
    display: inline-block;
    position: relative;
    height: 100%;
    margin: 0 0 0 2px;
    font-size: 14px;
    color: #fff;
    text-align: center;
    width: 50px;
    box-sizing: border-box;
    border-radius: 4px;
    font-weight: 600;
    line-height: 20px;
    user-select: none;
    cursor: default;
    border: 1px solid rgb(55, 55, 55);
  }
  .type[data--file="true"] {
    background-color: #ff666633;
  }
  .type[data--file="true"][data--select="true"] {
    background-color: #ff6666ff;
  }
  .type[data--file="false"][data--use="all"] {
    background-color: #191;
  }
  .type[data--file="false"][data--use="none"] {
    background-color: #11991133;
  }
  .type[data--file="false"][data--use="some"] {
    background-color: #99991188;
  }
  .str {
    display: inline-block;
    position: relative;
    height: 100%;
    /*margin: 0 0 0 4px;*/
    font-size: 14px;
    padding: 0 2px;
    box-sizing: border-box;
    color: #333333;
  }
  .str[data--file="true"] {
    /*background-color: #ff999933;*/
    &:hover {
      color: #33aa33;
      /*user-select: contain;*/
    }
  }
  .str[data--file="false"] {
    border: 1px solid #00000044;
    background-color: #ffffff33;
    border-radius: 2px;
    margin-left: 2px;
  }
  .str[data--dirmode="true"] {
    margin-left: 2px;
  }
  .dir {
    display: inline-block;
    position: relative;
    height: 100%;
    margin: 0 0 0 2px;
    font-size: 14px;
    padding: 0 2px;
    box-sizing: border-box;
    color: #333388aa;
    background-color: #ffff3333;
  }
  .filecnt {
    display: inline-block;
    position: relative;
    height: 100%;
    margin: 0 0 0 8px;
    font-size: 14px;
    padding: 0 2px;
    box-sizing: border-box;
    color: #aa3333ff;
    font-weight: 600;
  }
</style>
