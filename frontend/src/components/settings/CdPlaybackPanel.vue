<script setup lang="ts">
import { computed } from "vue";
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import { cd, setCdEnabled, setCdSelectedDriveId } from "@/stores/cd";
import {
  requestListOpticalDrives,
} from "@/exclusive/opticalClient";
import { syncCompanionConnection } from "@/exclusive/companionClient";
import SettingsSelect from "@/components/settings/SettingsSelect.vue";

withDefaults(
  defineProps<{
    openMenu?: string | null;
  }>(),
  { openMenu: null },
);
const emit = defineEmits<{
  toggle: [id: string];
}>();

const driveOptions = computed(() =>
  cd.drives.map((d) => ({ id: d.id, label: d.name || d.id })),
);

const driveDisabled = computed(
  () =>
    exclusiveAudio.connection !== "connected" ||
    exclusiveAudio.role === "readonly",
);

const driveMissing = computed(() => {
  if (!cd.enabled || !cd.selectedDriveId) return false;
  if (exclusiveAudio.connection !== "connected") return false;
  return !cd.drives.some((d) => d.id === cd.selectedDriveId);
});

function onEnable(e: Event) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  setCdEnabled(target.checked);
  syncCompanionConnection();
  if (target.checked) requestListOpticalDrives();
}

function onDrive(id: string) {
  setCdSelectedDriveId(id);
}

function onRefresh() {
  requestListOpticalDrives();
}
</script>

<template>
  <div class="modal-section">
    <div class="modal-section-title">CD playback</div>
    <p class="modal-hint">
      Play a Red Book audio CD through the Desktop companion on this Mac.
    </p>

    <label class="toggle-row">
      <span class="toggle-label">Enable CD playback</span>
      <input
        type="checkbox"
        class="toggle-input"
        :checked="cd.enabled"
        @change="onEnable"
      />
    </label>

    <template v-if="cd.enabled">
      <SettingsSelect
        menu-id="cd-drive"
        label-id="cd-drive-label"
        field-label="Optical drive"
        :options="driveOptions"
        :selected-id="cd.selectedDriveId"
        placeholder="Select drive…"
        :disabled="driveDisabled"
        :open-menu="openMenu"
        @toggle="emit('toggle', $event)"
        @choose="onDrive"
      />
      <p v-if="driveMissing" class="modal-hint warn">Drive missing</p>
      <div class="scan-actions" style="margin-top:8px">
        <button
          type="button"
          class="pill"
          :disabled="driveDisabled"
          @click="onRefresh"
        >Refresh drives</button>
      </div>
    </template>
  </div>
</template>
