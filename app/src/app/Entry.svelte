<script lang="ts">
  import { onMount } from "svelte";
  import store from "./store/store";
  import FileUtil from "./util/data/fileUtil";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import SystemMenu from "./contents/system/SystemMenu.svelte";
  import MainFrame from "./contents/system/MainFrame.svelte";
  import DialogManager from "./contents/detail/DialogManager.svelte";
  import LicenseUtil from "./contents/detail/setting/license/licenseUtil";
  import ToastFrame from "./util/item/ToastFrame.svelte";
  import { global } from "./global";
  import StartFrame from "./contents/system/StartFrame.svelte";
  import Record from "./util/layout/RecordDiv.svelte";

  let toastFrameRef: ToastFrame;

  let args: string[] | null = null;
  onMount(async () => {
    await listen<string[]>("file-drop", async (event) => {
      const files: string[] = event.payload;
      if (files.length === 1 && $store.workspace == null) {
        const filePath = files[0];
        await FileUtil.loadWorkspaceFile(filePath);
      }
    });

    await FileUtil.updateAppTitle();
    // window へ global keydown を登録
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault(); // ブラウザの「ページを保存」ダイアログをブロック
        e.stopPropagation(); // 必要なら他のハンドラへも流れない

        if ($store.workspace != null) {
          FileUtil.saveWorkspace();
        }
      }
      // リロード完全禁止
      if (
        e.key === "F5" ||
        (e.ctrlKey && e.key === "r") ||
        (e.ctrlKey && e.shiftKey && e.key === "R")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
      if ($store.shortcutEvent != null) $store.shortcutEvent(e);
    });
    window.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    args = (await invoke("get_cli_args")) as string[];

    if (args.length >= 2) {
      const filePath = args[1];
      await FileUtil.loadWorkspaceFile(filePath);
    }

    const payload = await LicenseUtil.loadLicenseOnStartup();
    // console.log(payload);
    if (payload != null) {
      $store.license = LicenseUtil.getConvertedLicenseFromPayload(payload);
      FileUtil.updateAppTitle();
    }

    // グローバルに注入
    $global.toastDisp = toastFrameRef.disp;
    // alert(args);
    // // クリーンアップ（コンポーネントが破棄されるとき）
    // return () => {
    //   window.removeEventListener("contextmenu", handler);
    // };
  });
</script>

{#if args != null}
  <SystemMenu />
  <Record surplus={30}>
    {#if $store.workspace != null}
      <MainFrame />
    {:else}
      <StartFrame />
    {/if}
  </Record>
  <DialogManager />
  <ToastFrame bind:this={toastFrameRef} />
{/if}
