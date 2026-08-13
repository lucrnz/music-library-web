import {
  computed,
  defineComponent,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { pl } from "../../stores/playlist.js";
import { playIndex } from "../../stores/player.js";
import { canReachServer } from "../../connectivity.js";
import { connectivity } from "../../stores/connectivity.js";
import {
  PLAYBACK_POLICIES,
  settings,
  closeSettings,
  setStreamWifi,
  setStreamCellular,
  setDownloadCodec,
  setPlaybackPolicy,
  setOnlyDownloadOnWifi,
} from "../../stores/settings.js";
import {
  clearStoredDownloads,
  disableDownloads,
  downloadsIdleSummaryLine,
  downloadsStorageLine as formatDlStorage,
  enableDownloads,
  openDownloadsManager,
  refreshStorageInfo,
} from "../../downloads/index.js";
import { downloads } from "../../downloads/state.js";
import { confirmDialog } from "../../stores/dialog.js";
import { showToast } from "../../stores/ui.js";
import {
  exclusiveAudio,
  shouldHideBrowserQualityControls,
} from "../../stores/exclusiveAudio.js";
import Icon from "../icons/Icon.js";
import ExclusiveAudioPanel from "./ExclusiveAudioPanel.js";
import LibraryScanPanel from "./LibraryScanPanel.js";
import QualitySelect from "./QualitySelect.js";

const SAME_AS_WIFI = "__same_as_wifi__";

export default defineComponent({
  name: "SettingsModal",
  components: { Icon, QualitySelect, LibraryScanPanel, ExclusiveAudioPanel },
  setup() {
    const downloadsBusy = ref(false);
    /** @type {import('vue').Ref<string|null>} */
    const openMenu = ref(null);
    const qualityRoot = ref(null);

    const libraryReachable = computed(() => {
      void connectivity.state;
      return canReachServer();
    });

    const showNetworkQuality = computed(
      () => settings.canDetectConnectionType
    );

    const hideBrowserQuality = computed(() =>
      shouldHideBrowserQualityControls()
    );

    const showExclusivePanel = computed(() => exclusiveAudio.capable);

    const streamFieldLabel = computed(() =>
      showNetworkQuality.value ? "Streaming — Wi‑Fi" : "Streaming"
    );

    const scanPanelActive = computed(
      () => settings.open && libraryReachable.value
    );

    function labelFor(id) {
      const hit = settings.options.find((o) => o.id === id);
      return hit?.label || id || "—";
    }

    const wifiLabel = computed(() => labelFor(settings.streamWifi));
    const cellularLabel = computed(() => {
      if (settings.streamCellular == null) return "Same as Wi‑Fi";
      return labelFor(settings.streamCellular);
    });
    const downloadLabel = computed(() => labelFor(settings.download));
    const policyLabel = computed(() => {
      const hit = PLAYBACK_POLICIES.find((p) => p.id === settings.playbackPolicy);
      return hit?.label || settings.playbackPolicy;
    });
    const policyHint = computed(() => {
      const hit = PLAYBACK_POLICIES.find((p) => p.id === settings.playbackPolicy);
      return hit?.hint || "";
    });

    const cellularLeading = [
      { id: SAME_AS_WIFI, label: "Same as Wi‑Fi" },
    ];
    const cellularSelectedId = computed(() =>
      settings.streamCellular == null ? SAME_AS_WIFI : settings.streamCellular
    );

    const playbackCtx = () => ({
      tracks: pl.tracks,
      index: pl.index,
      playIndex,
    });

    function toggleMenu(id) {
      openMenu.value = openMenu.value === id ? null : id;
    }

    function chooseWifi(id) {
      openMenu.value = null;
      setStreamWifi(id, playbackCtx());
    }

    function chooseCellular(id) {
      openMenu.value = null;
      setStreamCellular(id === SAME_AS_WIFI ? null : id, playbackCtx());
    }

    function chooseDownload(id) {
      openMenu.value = null;
      setDownloadCodec(id);
    }

    function choosePolicy(id) {
      openMenu.value = null;
      setPlaybackPolicy(id);
    }

    function onOnlyWifiChange(e) {
      setOnlyDownloadOnWifi(e.target.checked);
    }

    function onDocPointer(e) {
      if (!openMenu.value) return;
      const el = qualityRoot.value;
      if (el && !el.contains(e.target)) openMenu.value = null;
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

    async function onToggleDownloads(e) {
      const want = e.target.checked;
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
      } catch (err) {
        console.error(err);
        showToast(err.message || "Could not update downloads setting");
        e.target.checked = downloads.enabled;
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
      } catch (err) {
        console.error(err);
        showToast(err.message || "Could not clear downloads");
      } finally {
        downloadsBusy.value = false;
      }
    }

    function onKey(e) {
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

    return {
      settings,
      downloads,
      libraryReachable,
      scanPanelActive,
      showNetworkQuality,
      hideBrowserQuality,
      showExclusivePanel,
      streamFieldLabel,
      downloadsBusy,
      downloadsStorageLine,
      showIdleDownloads,
      idleDownloadsSummary,
      openMenu,
      qualityRoot,
      wifiLabel,
      cellularLabel,
      cellularLeading,
      cellularSelectedId,
      downloadLabel,
      policyLabel,
      policyHint,
      playbackPolicies: PLAYBACK_POLICIES,
      closeSettings,
      toggleMenu,
      chooseWifi,
      chooseCellular,
      chooseDownload,
      choosePolicy,
      onOnlyWifiChange,
      onToggleDownloads,
      onOpenManager,
      onClearStoredDownloads,
    };
  },
  template: `
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

        <div v-if="!hideBrowserQuality" class="modal-section" ref="qualityRoot">
          <div class="modal-section-title">Quality</div>
          <p class="modal-hint">
            Choose streaming quality
            <template v-if="showNetworkQuality"> for Wi‑Fi and mobile data</template>.
            <template v-if="downloads.enabled"> Downloads use their own quality setting.</template>
          </p>

          <QualitySelect
            menu-id="wifi"
            label-id="wifi-codec-label"
            :field-label="streamFieldLabel"
            :options="settings.options"
            :selected-id="settings.streamWifi"
            :trigger-label="wifiLabel"
            :open-menu="openMenu"
            @toggle="toggleMenu"
            @choose="chooseWifi"
          />

          <QualitySelect
            v-if="showNetworkQuality"
            menu-id="cellular"
            label-id="cell-codec-label"
            field-label="Streaming — Mobile data"
            :options="settings.options"
            :selected-id="cellularSelectedId"
            :trigger-label="cellularLabel"
            :open-menu="openMenu"
            :leading-options="cellularLeading"
            @toggle="toggleMenu"
            @choose="chooseCellular"
          />

          <QualitySelect
            v-if="downloads.enabled"
            menu-id="download"
            label-id="dl-codec-label"
            field-label="Downloads quality"
            :options="settings.options"
            :selected-id="settings.download"
            :trigger-label="downloadLabel"
            :open-menu="openMenu"
            @toggle="toggleMenu"
            @choose="chooseDownload"
          >
            <p class="modal-hint" style="margin-top:8px;margin-bottom:0">
              Existing downloads keep their quality. Only new downloads use this setting.
            </p>
          </QualitySelect>

          <QualitySelect
            menu-id="policy"
            label-id="policy-label"
            field-label="When a download exists"
            :options="playbackPolicies"
            :selected-id="settings.playbackPolicy"
            :trigger-label="policyLabel"
            :open-menu="openMenu"
            @toggle="toggleMenu"
            @choose="choosePolicy"
          >
            <p class="modal-hint" style="margin-top:8px;margin-bottom:0">{{ policyHint }}</p>
          </QualitySelect>
        </div>
        <div v-else class="modal-section">
          <div class="modal-section-title">Quality</div>
          <p class="modal-hint">
            Browser stream and download quality controls are hidden while exclusive audio is enabled.
          </p>
        </div>

        <ExclusiveAudioPanel v-if="showExclusivePanel" />

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
          <label
            v-if="showNetworkQuality && downloads.enabled"
            class="toggle-row"
          >
            <span class="toggle-label">Only download on Wi‑Fi</span>
            <input
              type="checkbox"
              class="toggle-input"
              :checked="settings.onlyDownloadOnWifi"
              @change="onOnlyWifiChange"
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
      </div>
    </div>
  `,
});
