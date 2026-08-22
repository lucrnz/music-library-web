<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { canReachServer } from "@/connectivity";
import { connectivity } from "@/stores/connectivity";
import {
  PLAYBACK_POLICIES,
  settings,
  closeSettings,
  setStreamCodec,
  setDownloadCodec,
  setPlaybackPolicy,
} from "@/stores/settings";
import {
  clearStoredDownloads,
  disableDownloads,
  downloadsIdleSummaryLine,
  downloadsStorageLine as formatDlStorage,
  enableDownloads,
  openDownloadsManager,
  refreshStorageInfo,
} from "@/downloads/index";
import { downloads } from "@/downloads/state";
import { confirmDialog } from "@/stores/dialog";
import { copyText } from "@/clipboard";
import { showToast } from "@/stores/ui";
import {
  DIAG_MODES,
  diag,
  setMode as setDiagMode,
} from "@/diag/log";
import {
  exclusiveAudio,
  shouldHideBrowserQualityControls,
} from "@/stores/exclusiveAudio";
import Icon from "@/components/icons/Icon.vue";
import ExclusiveAudioPanel from "@/components/settings/ExclusiveAudioPanel.vue";
import LibraryScanPanel from "@/components/settings/LibraryScanPanel.vue";
import SettingsSelect from "@/components/settings/SettingsSelect.vue";

const playbackPolicies = PLAYBACK_POLICIES;
    const diagModes = DIAG_MODES;
    const downloadsBusy = ref(false);
    const openMenu = ref<string | null>(null);

    const libraryReachable = computed(() => {
      void connectivity.state;
      return canReachServer();
    });

    const hideBrowserQuality = computed(() =>
      shouldHideBrowserQualityControls()
    );

    const showExclusivePanel = computed(() => exclusiveAudio.capable);

    const scanPanelActive = computed(
      () => settings.open && libraryReachable.value
    );

    const policyHint = computed(() => {
      const hit = PLAYBACK_POLICIES.find((p) => p.id === settings.playbackPolicy);
      return hit?.hint || "";
    });

    function toggleMenu(id: string) {
      openMenu.value = openMenu.value === id ? null : id;
    }

    function chooseStream(id: string) {
      setStreamCodec(id);
    }

    function chooseDownload(id: string) {
      setDownloadCodec(id);
    }

    function choosePolicy(id: string) {
      if (
        id === "prefer_better" ||
        id === "prefer_offline" ||
        id === "prefer_stream"
      ) {
        setPlaybackPolicy(id);
      }
    }

    function onDocPointer(e: PointerEvent) {
      if (!openMenu.value) return;
      const t = e.target;
      if (t instanceof Element && t.closest(".settings-select")) {
        return;
      }
      openMenu.value = null;
    }

    const downloadsStorageLine = computed(() => {
      if (!downloads.enabled) return "";
      return formatDlStorage("short");
    });

    /** Leftover OPFS/IDB catalog while the feature is off. */
    const showIdleDownloads = computed(
      () => !downloads.enabled && downloads.trackCount > 0
    );

    const idleDownloadsSummary = computed(() => downloadsIdleSummaryLine());

    async function onToggleDownloads(e: Event) {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      const want = input.checked;
      if (want === downloads.enabled) return;
      downloadsBusy.value = true;
      try {
        if (want) {
          await enableDownloads();
          await refreshStorageInfo();
        } else {
          // Keep files on device; idle summary + Clear can wipe later.
          await disableDownloads({ wipe: false });
        }
      } catch (err: unknown) {
        console.error(err);
        showToast(err instanceof Error ? err.message : "Could not update downloads setting");
        input.checked = downloads.enabled;
      } finally {
        downloadsBusy.value = false;
      }
    }

    function onOpenManager() {
      closeSettings();
      openDownloadsManager();
    }

    async function onClearStoredDownloads() {
      const ok = await confirmDialog({
        title: "Clear downloads",
        message: "Delete all downloaded music from this device?",
        confirmLabel: "Clear",
        danger: true,
      });
      if (!ok) return;
      downloadsBusy.value = true;
      try {
        await clearStoredDownloads();
      } catch (err: unknown) {
        console.error(err);
        showToast(err instanceof Error ? err.message : "Could not clear downloads");
      } finally {
        downloadsBusy.value = false;
      }
    }

    function chooseDiagMode(id: string) {
      if (id === "errors" || id === "everything") {
        setDiagMode(id);
      }
      openMenu.value = null;
    }

    async function copyDiagId(value: string | null) {
      if (!value) return;
      await copyText(value);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || !settings.open) return;
      if (openMenu.value) {
        openMenu.value = null;
        e.preventDefault();
        return;
      }
      closeSettings();
    }

    watch(
      () => settings.open,
      (open) => {
        if (open) {
          // Needed when disabled so idle leftover counts are correct.
          refreshStorageInfo().catch(() => {});
          document.addEventListener("keydown", onKey);
          document.addEventListener("pointerdown", onDocPointer, true);
        } else {
          openMenu.value = null;
          document.removeEventListener("keydown", onKey);
          document.removeEventListener("pointerdown", onDocPointer, true);
        }
      }
    );

    onUnmounted(() => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDocPointer, true);
    });
</script>

<template>
    <div
      id="settings-modal"
      class="modal"
      :class="{ hidden: !settings.open }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div class="modal-backdrop" @click="closeSettings"></div>
      <div class="modal-sheet">
        <div class="modal-head">
          <div class="modal-title" id="settings-title">Settings</div>
          <button
            type="button"
            class="icon-btn"
            title="Close"
            aria-label="Close settings"
            @click="closeSettings"
          >
            <Icon name="close" />
          </button>
        </div>

        <div v-if="!hideBrowserQuality" class="modal-section">
          <div class="modal-section-title">Quality</div>
          <p class="modal-hint">
            Choose streaming quality.
            <template v-if="downloads.enabled"> Downloads use their own quality setting.</template>
          </p>

          <SettingsSelect
            menu-id="stream"
            label-id="stream-codec-label"
            field-label="Streaming"
            :options="settings.options"
            :selected-id="settings.streamCodec"
            :open-menu="openMenu"
            @toggle="toggleMenu"
            @choose="chooseStream"
          />

          <SettingsSelect
            v-if="downloads.enabled"
            menu-id="download"
            label-id="dl-codec-label"
            field-label="Downloads quality"
            :options="settings.options"
            :selected-id="settings.download"
            :open-menu="openMenu"
            @toggle="toggleMenu"
            @choose="chooseDownload"
          >
            <p class="modal-hint" style="margin-top:8px;margin-bottom:0">
              Existing downloads keep their quality. Only new downloads use this setting.
            </p>
          </SettingsSelect>

          <SettingsSelect
            menu-id="policy"
            label-id="policy-label"
            field-label="When a download exists"
            :options="playbackPolicies"
            :selected-id="settings.playbackPolicy"
            :open-menu="openMenu"
            @toggle="toggleMenu"
            @choose="choosePolicy"
          >
            <p class="modal-hint" style="margin-top:8px;margin-bottom:0">{{ policyHint }}</p>
          </SettingsSelect>
        </div>
        <div v-else class="modal-section">
          <div class="modal-section-title">Quality</div>
          <p class="modal-hint">
            While exclusive audio is on, streams use the best lossless quality your output device allows.
          </p>
        </div>

        <ExclusiveAudioPanel
          v-if="showExclusivePanel"
          :open-menu="openMenu"
          @toggle="toggleMenu"
        />

        <div class="modal-section">
          <div class="modal-section-title">Downloads</div>
          <p class="modal-hint">
            Store tracks on this device to save data and play offline.
          </p>
          <label class="toggle-row">
            <span class="toggle-label">Enable downloads</span>
            <input
              type="checkbox"
              class="toggle-input"
              :checked="downloads.enabled"
              :disabled="downloadsBusy"
              @change="onToggleDownloads"
            />
          </label>
          <p v-if="downloads.enabled && downloadsStorageLine" class="modal-hint" style="margin-top:8px">
            {{ downloadsStorageLine }}
          </p>
          <p v-if="downloads.enabled && downloads.nearQuota" class="modal-hint warn">
            Storage almost full — free space or delete downloads.
          </p>
          <div v-if="downloads.enabled" class="scan-actions" style="margin-top:10px">
            <button
              type="button"
              class="pill"
              @click="onOpenManager"
            >Download manager</button>
          </div>
          <template v-else-if="showIdleDownloads">
            <p class="modal-hint" style="margin-top:8px">
              {{ idleDownloadsSummary }}
            </p>
            <div class="scan-actions" style="margin-top:10px">
              <button
                type="button"
                class="pill danger"
                :disabled="downloadsBusy"
                @click="onClearStoredDownloads"
              >Clear</button>
            </div>
          </template>
        </div>

        <LibraryScanPanel
          :active="scanPanelActive"
          :library-reachable="libraryReachable"
        />

        <div class="modal-section">
          <div class="modal-section-title">Diagnostics</div>
          <p class="modal-hint">
            Errors only sends playback and other failures. Everything sends the
            full diagnostic timeline and labels a session.
          </p>
          <SettingsSelect
            menu-id="diag-mode"
            label-id="diag-mode-label"
            field-label="What to send"
            :options="diagModes"
            :selected-id="diag.mode"
            :open-menu="openMenu"
            @toggle="toggleMenu"
            @choose="chooseDiagMode"
          />
          <p class="modal-hint" style="margin-top:10px">
            Client
            <button
              type="button"
              class="pill"
              :disabled="!diag.clientId"
              @click="copyDiagId(diag.clientId)"
            >Copy</button>
          </p>
          <p class="modal-hint" style="margin-top:4px;word-break:break-all">
            {{ diag.clientId || "—" }}
          </p>
          <template v-if="diag.mode === 'everything'">
            <p class="modal-hint" style="margin-top:10px">
              Session
              <button
                type="button"
                class="pill"
                :disabled="!diag.sessionId"
                @click="copyDiagId(diag.sessionId)"
              >Copy</button>
            </p>
            <p class="modal-hint" style="margin-top:4px;word-break:break-all">
              {{ diag.sessionId || "—" }}
            </p>
          </template>
        </div>
      </div>
    </div>
</template>
