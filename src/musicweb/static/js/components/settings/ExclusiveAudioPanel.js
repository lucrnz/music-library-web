/**
 * Exclusive audio settings — Mac installed PWA only.
 */
import { computed, defineComponent } from "vue";
import {
  exclusiveAudio,
  isExclusiveArmed,
  setExclusiveEnabled,
  setExclusivePort,
  setFormatMode,
  setHogToken,
  setSelectedDeviceId,
} from "../../stores/exclusiveAudio.js";
import { requestListDevices } from "../../exclusive/companionClient.js";
import { DEFAULT_PORT } from "../../exclusive/protocol.js";

export default defineComponent({
  name: "ExclusiveAudioPanel",
  setup() {
    const connectionLabel = computed(() => {
      switch (exclusiveAudio.connection) {
        case "connected":
          return exclusiveAudio.role === "controller"
            ? "Connected (controller)"
            : exclusiveAudio.role === "readonly"
              ? "Connected (read-only — controlled elsewhere)"
              : "Connected";
        case "connecting":
          return "Connecting…";
        case "rejected":
          return `Rejected (${exclusiveAudio.lastError || "auth"})`;
        default:
          return "Disconnected";
      }
    });

    const armed = computed(() => isExclusiveArmed());

    const deviceLabel = computed(() => {
      const id = exclusiveAudio.selectedDeviceId;
      if (!id) return "Select device…";
      const hit = exclusiveAudio.devices.find((d) => d.id === id);
      return hit?.name || id;
    });

    function onEnable(e) {
      setExclusiveEnabled(e.target.checked);
    }

    function onToken(e) {
      setHogToken(e.target.value);
    }

    function onPort(e) {
      setExclusivePort(e.target.value);
    }

    function onFormatMode(e) {
      setFormatMode(e.target.value);
    }

    function onDevice(e) {
      setSelectedDeviceId(e.target.value || null);
    }

    function onRefreshDevices() {
      requestListDevices();
    }

    return {
      exclusiveAudio,
      connectionLabel,
      armed,
      deviceLabel,
      DEFAULT_PORT,
      onEnable,
      onToken,
      onPort,
      onFormatMode,
      onDevice,
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

      <label class="field-row" style="display:block;margin-top:10px">
        <span class="modal-hint" style="display:block;margin-bottom:4px">HOG_TOKEN</span>
        <input
          type="password"
          autocomplete="off"
          spellcheck="false"
          class="text-input"
          style="width:100%;box-sizing:border-box"
          :value="exclusiveAudio.hogToken"
          @input="onToken"
          placeholder="Same value as companion env"
        />
      </label>

      <label class="field-row" style="display:block;margin-top:10px">
        <span class="modal-hint" style="display:block;margin-bottom:4px">
          Companion port (default {{ DEFAULT_PORT }})
        </span>
        <input
          type="number"
          min="1"
          max="65535"
          class="text-input"
          style="width:8rem"
          :value="exclusiveAudio.port"
          @change="onPort"
        />
      </label>

      <p class="modal-hint" style="margin-top:10px">
        Status: {{ connectionLabel }}
        <template v-if="exclusiveAudio.enabled">
          · {{ armed ? "Armed — ready to play" : "Not armed (need connection + device as controller)" }}
        </template>
      </p>
      <p v-if="exclusiveAudio.lastError" class="modal-hint warn">
        {{ exclusiveAudio.lastError }}
      </p>

      <template v-if="exclusiveAudio.enabled">
        <label class="field-row" style="display:block;margin-top:10px">
          <span class="modal-hint" style="display:block;margin-bottom:4px">Format mode</span>
          <select
            class="text-input"
            style="width:100%"
            :value="exclusiveAudio.formatMode"
            @change="onFormatMode"
          >
            <option value="prefer_source">Prefer source rate / depth</option>
            <option value="upsample_device">Upsample to device max</option>
          </select>
        </label>

        <label class="field-row" style="display:block;margin-top:10px">
          <span class="modal-hint" style="display:block;margin-bottom:4px">Output device</span>
          <select
            class="text-input"
            style="width:100%"
            :value="exclusiveAudio.selectedDeviceId || ''"
            :disabled="exclusiveAudio.role === 'readonly'"
            @change="onDevice"
          >
            <option value="">{{ deviceLabel === 'Select device…' ? 'Select device…' : '—' }}</option>
            <option
              v-for="d in exclusiveAudio.devices"
              :key="d.id"
              :value="d.id"
            >{{ d.name }}</option>
          </select>
        </label>
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
