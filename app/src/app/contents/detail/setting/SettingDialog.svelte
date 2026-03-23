<script lang="ts">
  import LabelRecord from "../../../util/item/LabelRecord.svelte";
  import Wrap from "../../../util/layout/Wrap.svelte";
  import DialogHeader from "../DialogHeader.svelte";
  import HalfPanel from "../../../util/layout/HalfPanel.svelte";
  import LicensePanel from "./license/LicensePanel.svelte";
  import Record from "../../../util/layout/RecordDiv.svelte";
  import NumberInput from "../../../util/form/NumberInput.svelte";
  import store from "../../../store/store";

  $: setting = $store.setting;
</script>

<div class="frame">
  <DialogHeader title={"Setting"} />
  <Record surplus={30}>
    <Wrap margin={2} bgColor={"#000"}>
      <HalfPanel>
        <Wrap margin={4} bgColor={"#556"}>
          <LabelRecord name={"monaco_font_size"} />
          <NumberInput
            min={10}
            max={30}
            value={setting.monacoFontSize}
            set={(v) => (setting.monacoFontSize = v)}
          />
        </Wrap>
      </HalfPanel>
      <HalfPanel>
        <LicensePanel />
      </HalfPanel>
    </Wrap>
  </Record>
</div>

<style>
  .frame {
    display: inline-block;
    position: relative;
    margin: 8px 0 0 8px;
    width: 800px;
    height: 600px;
    background-color: rgb(0, 0, 0);
    opacity: 0.95;
  }
</style>
