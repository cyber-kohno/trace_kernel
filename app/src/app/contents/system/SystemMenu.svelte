<script lang="ts">
  import store, { dirty } from "../../store/store";
  import OperationButton from "../../util/button/OperationButton.svelte";
  import FileUtil from "../../util/data/fileUtil";
  import Record from "../../util/layout/RecordDiv.svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { relaunch } from "@tauri-apps/plugin-process";

  const closeWorkspace = () => {
    const exec = () => {
      $store.workspace = null;
      $store.handlePath = null;
      $store.target = null;
      $store.dialog = null;
      FileUtil.updateAppTitle();
    };
    if (!$dirty) {
      exec();
    } else {
      ask("There is unsaved data. Can I delete it?", {
        title: "Close workspace",
      }).then((isOk) => {
        if (isOk) exec();
      });
    }
  };

  const openSettingDialog = () => {
    $store.dialog = "setting";
  };

  const restart = async () => {
    ask(
      "The application will restart. Any unsaved changes will be lost. Do you want to continue?",
      {
        title: "Confirm Restart",
      },
    ).then(async (isOk) => {
      if (isOk) {
        if (import.meta.env.DEV) {
          window.location.reload();
        } else {
          await relaunch();
        }
      }
    });
  };

  $: isOpenProject = $store.workspace != null;
  $: saveProject = () => {
    FileUtil.saveWorkspace();
  };
</script>

<Record height={30} align="left" padding={"0 0 0 4px"} bgColor="#334">
  <OperationButton
    name={"Save"}
    isDisable={!isOpenProject || !$dirty}
    callback={saveProject}
    isLineup
  />
  <OperationButton
    name={"Close"}
    isDisable={!isOpenProject}
    callback={closeWorkspace}
    isLineup
  />
  <OperationButton name={"Setting"} callback={openSettingDialog} isLineup />
  <OperationButton name={"Restart"} callback={restart} isLineup />
</Record>
