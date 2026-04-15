<script lang="ts">
  import { writable } from "svelte/store";
  import TextInput from "../../../../util/form/TextInput.svelte";
  import LabelRecord from "../../../../util/item/LabelRecord.svelte";
  import Wrap from "../../../../util/layout/Wrap.svelte";
  import OperationButton from "../../../../util/button/OperationButton.svelte";
  import LicenseUtil from "./licenseUtil";
  import Record from "../../../../util/layout/RecordDiv.svelte";
  import store from "../../../../store/store";
  import FileUtil from "../../../../util/data/fileUtil";

  let productKey = writable<string | null>(null);
  let error = writable<string>("");

  $: isLicensed = $store.license != null;

  $: license = $store.license;

  $: toggle = () => {
    $error = "";
    $productKey = $productKey == null ? "" : null;
  };

  const activate = async () => {
    if ($productKey == null) throw new Error();
    try {
      const payload =
        await LicenseUtil.parseActivateInfoFromProductKey($productKey);
      console.log(payload);
      LicenseUtil.saveLicense($productKey);

      $store.license = LicenseUtil.getConvertedLicenseFromPayload(payload);
      FileUtil.updateAppTitle();
      toggle();
    } catch {
      $error = "Invalid license key.";
    }
  };
</script>

<Wrap margin={4} bgColor={"#556"}>
  <LabelRecord name={"license"} />
  {#if $productKey != null}
    <TextInput
      width={"calc(100% - 4px)"}
      set={(v) => {
        $productKey = v;
      }}
      value={$productKey}
      requied
    />
    <Record align="right">
      {#if $error !== ""}
        <Record height={24}>
          <div class="error">{$error}</div>
        </Record>
      {/if}
      <OperationButton name={"Cancel"} callback={toggle} isLineup width={110} />
      <OperationButton
        name={"Verify"}
        isDisable={$productKey === ""}
        callback={activate}
        isLineup
        width={140}
      />
    </Record>
  {:else}
    <Record height={120}>
      <Wrap margin={2}>
        <div class="msg">
          <span
            >Status: <span class="high">{isLicensed ? "Pro" : "Free"}</span> Version</span
          ><br />
          <span
            >Features are <span class="high"
              >{isLicensed ? "[core, io, net]" : "[core]"}</span
            >.</span
          ><br />
          {#if license != null}
            <!-- <br /> -->
            <span
              >Issued to: <span class="high">{license.displayId}</span></span
            ><br />
            <span>Issued on: <span class="high">{license.date}</span></span>
          {/if}
        </div>
      </Wrap>
    </Record>
    <OperationButton name={"Activate"} callback={toggle} />
  {/if}
</Wrap>

<style>
  .msg {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.207);
    padding: 2px;
    box-sizing: border-box;
  }
  span {
    font-size: 16px;
    font-weight: 400;
    color: rgb(148, 183, 255);
  }
  .high {
    color: rgb(231, 250, 255);
  }

  .error {
    display: inline-block;
    position: relative;
    width: calc(100% - 4px);
    height: 100%;
    margin: 0 0 0 2px;
    /* background-color: rgba(255, 255, 255, 0.083); */
    padding: 0 0 0 2px;
    box-sizing: border-box;
    font-size: 16px;
    font-weight: 400;
    color: rgb(252, 69, 69);
  }
</style>
