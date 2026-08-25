<script setup lang="ts">
/**
 * Exclusive audio settings — Mac installed PWA only.
 */
import { computed } from "vue";
import { formatExclusiveFace } from "@/exclusive/statusFace";
import {
  exclusiveAudio,
  exclusiveStatusSnapshot,
  setExclusiveEnabled,
  setFormatMode,
  setSelectedDeviceId,
} from "@/stores/exclusiveAudio";
import {
  requestListDevices,
  syncCompanionConnection,
  syncPreferredDevice,
} from "@/exclusive/companionClient";
import SettingsSelect from "@/components/settings/SettingsSelect.vue";

const FORMAT_OPTIONS = [
  { id: "prefer_source", label: "Prefer source rate / depth" },
  { id: "upsample_device", label: "Upsample to device max" },
];

withDefaults(
  defineProps<{
    openMenu?: string | null;
  }>(),
  { openMenu: null },
);
const emit = defineEmits<{
  toggle: [id: string];
}>();

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
    return { kind: "off", text: "Off", icon: "", interactive: false };
  }
  return (
    formatExclusiveFace(snap) || {
      kind: "off",
      text: "Off",
      icon: "",
      interactive: false,
    }
  );
});

const deviceOptions = computed(() =>
  exclusiveAudio.devices.map((d) => ({
    id: d.id,
    label: d.name || d.id,
  })),
);

const deviceDisabled = computed(
  () =>
    exclusiveAudio.connection !== "connected" ||
    exclusiveAudio.role === "readonly",
);

function onEnable(e: Event) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  setExclusiveEnabled(target.checked);
  syncCompanionConnection();
}

function onMenuToggle(id: string) {
  emit("toggle", id);
}

function onFormatMode(id: string) {
  setFormatMode(id);
}

function onDevice(id: string) {
  setSelectedDeviceId(id);
  syncPreferredDevice();
}

function onRefreshDevices() {
  requestListDevices();
}
</script>

<template>
    <div class="modal-section">
      <div class="modal-section-title">Exclusive audio (macOS)</div>
      <p class="modal-hint">
        Hog Core Audio through the Desktop companion on this Mac. Set the token
        in Desktop companion, then enable exclusive and pick a device.
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
</template>
