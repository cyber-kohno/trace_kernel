<script lang="ts">
  import { writable } from "svelte/store";
  import Record from "../../layout/RecordDiv.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { FileStat } from "../../../store/types";
  import { onMount } from "svelte";

  export let isDir: boolean;
  export let path: string;

  let timerId = -1;
  let prev = "";

  let msg = writable<string>("");
  let status = writable<"idol" | "valid" | "invalid">("idol");

  $: check = () => {
    if (timerId !== -1) clearTimeout(timerId);
    prev = path;

    if (path === "") {
      $msg = "None";
      $status = "invalid";
    } else {
      $msg = "Checking...";
      $status = "idol";
      timerId = setTimeout(() => {
        invoke<FileStat>("stat", { path })
          .then((res) => {
            if (isDir !== res.isDir) {
              $msg = `The path must be a ${isDir ? "directory" : "file"}.`;
              $status = "invalid";
            } else {
              $msg = `The ${isDir ? "directory" : "file"} path is valid`;
              $status = "valid";
            }
          })
          .catch(() => {
            $msg = "Invalid path";
            $status = "invalid";
          });
      }, 500);
    }
  };

  onMount(() => {
    check();
  });
  $: {
    if (prev !== path) check();
  }
</script>

<Record height={20}>
  <div data--status={$status}>{$msg}</div>
</Record>

<style>
  div {
    display: inline-block;
    position: relative;
    margin: 0 0 0 4px;
    height: 100%;
    /* background-color: rgba(255, 255, 255, 0.088); */
    padding: 0 4px;
    box-sizing: border-box;

    font-size: 15px;
    line-height: 20px;
    color: rgba(255, 255, 255, 0.397);
    font-weight: 400;
  }
  [data--status="valid"] {
    color: rgb(192, 255, 158);
  }
  [data--status="invalid"] {
    color: rgb(255, 76, 76);
  }
</style>
