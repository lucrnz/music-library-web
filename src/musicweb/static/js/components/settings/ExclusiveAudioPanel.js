/**
 * Exclusive audio settings — Mac installed PWA only.
 */
import { computed, defineComponent } from "vue";
import { formatExclusiveFace } from "../../exclusive/statusFace.js";
import {
  exclusiveAudio,
  exclusiveStatusSnapshot,
  setExclusiveEnabled,
  setExclusivePort,
  setFormatMode,
  setHogToken,
  setSelectedDeviceId,
} from "../../stores/exclusiveAudio.js";
import { requestListDevices } from "../../exclusive/companionClient.js";
import { DEFAULT_PORT } from "../../exclusive/protocol.js";
import SettingsSelect from "./SettingsSelect.js";

const FORMAT_OPTIONS = [
  { id: "prefer_source", label: "Prefer source rate / depth" },
  { id: "upsample_device", label: "Upsample to device max" },
];

export default defineComponent({
  name: "ExclusiveAudioPanel",
  components: { SettingsSelect },
  props: {
    openMenu: { type: String, default: null },
  },
  emits: ["toggle"],
  setup(props, { emit }) {
    const face = computed(() => {
      void exclusiveAudio.enabled;
      void exclusiveAudio.connection;
      void exclusiveAudio.role;
      void exclusiveAudio.lastError;
      void exclusiveAudio.selectedDeviceId;
      void exclusiveAudio.companionDeviceId;
      void exclusiveAudio.devices;
      void exclusiveAudio.capable;
      const snap = exclusiveStatusSnapshot();
      if (!snap.enabled) {
        return { text: "Off", kind: "off" };
      }
      return formatExclusiveFace(snap) || { text: "—", kind: "offline" };
    });

    const deviceOptions = computed(() =>
      exclusiveAudio.devices.map((d) => ({ id: d.id, label: d.name }))
    );

    const deviceDisabled = computed(
      () => exclusiveAudio.role === "readonly"
    );

    function onEnable(e) {
      setExclusiveEnabled(e.target.checked);
    }

    function onToken(e) {
      setHogToken(e.target.value);
    }

    function onPort(e) {
      setExclusivePort(e.target.value);
    }

    function onFormatMode(id) {
      setFormatMode(id);
    }

    function onDevice(id) {
      setSelectedDeviceId(id || null);
    }

    function onMenuToggle(id) {
      emit("toggle", id);
    }

    function onRefreshDevices() {
      requestListDevices();
    }

    return {
      exclusiveAudio,
      face,
      FORMAT_OPTIONS,
      deviceOptions,
      deviceDisabled,
      DEFAULT_PORT,
      onEnable,
      onToken,
      onPort,
      onFormatMode,
      onDevice,
      onMenuToggle,
      onRefreshDevices,
    };
  },
  template: `
    <div class="modal-section">
      <div class="modal-section-title">Exclusive audio (macOS)</div>
      <p class="modal-hint">
        Hog Core Audio via a local companion. Run
        <code>HOG_TOKEN=… uv run musicweb exclusive-audio</code>
        on this Mac, paste the same token below, then enable.
      </p>

      <label class="toggle-row">
        <span class="toggle-label">Enable exclusive playback</span>
        <input
          type="checkbox"
          class="toggle-input"
          :checked="exclusiveAudio.enabled"
          @change="onEnable"
        />
      </label>

      <div class="settings-field">
        <label class="settings-field-label" id="exclusive-token-label" for="exclusive-token">
          HOG_TOKEN
        </label>
        <input
          id="exclusive-token"
          type="password"
          autocomplete="off"
          spellcheck="false"
          class="text-input text-input-block"
          :value="exclusiveAudio.hogToken"
          @input="onToken"
          placeholder="Same value as companion env"
          aria-labelledby="exclusive-token-label"
        />
      </div>

      <div class="settings-field">
        <label class="settings-field-label" id="exclusive-port-label" for="exclusive-port">
          Companion port (default {{ DEFAULT_PORT }})
        </label>
        <input
          id="exclusive-port"
          type="number"
          min="1"
          max="65535"
          class="text-input text-input-narrow"
          :value="exclusiveAudio.port"
          @change="onPort"
          aria-labelledby="exclusive-port-label"
        />
      </div>

      <p class="modal-hint" style="margin-top:10px">
        Status: {{ face.text }}
      </p>
      <p
        v-if="exclusiveAudio.lastError && face.kind !== 'rejected' && face.kind !== 'ready'"
        class="modal-hint warn"
      >
        {{ exclusiveAudio.lastError }}
      </p>

      <template v-if="exclusiveAudio.enabled">
        <SettingsSelect
          menu-id="exclusive-format"
          label-id="exclusive-format-label"
          field-label="Format mode"
          :options="FORMAT_OPTIONS"
          :selected-id="exclusiveAudio.formatMode"
          :open-menu="openMenu"
          @toggle="onMenuToggle"
          @choose="onFormatMode"
        />

        <SettingsSelect
          menu-id="exclusive-device"
          label-id="exclusive-device-label"
          field-label="Output device"
          :options="deviceOptions"
          :selected-id="exclusiveAudio.selectedDeviceId"
          placeholder="Select device…"
          :disabled="deviceDisabled"
          :open-menu="openMenu"
          @toggle="onMenuToggle"
          @choose="onDevice"
        />

        <div class="scan-actions" style="margin-top:8px">
          <button
            type="button"
            class="pill"
            :disabled="exclusiveAudio.connection !== 'connected' || exclusiveAudio.role === 'readonly'"
            @click="onRefreshDevices"
          >Refresh devices</button>
        </div>
      </template>
    </div>
  `,
});
