import {
  computed,
  defineComponent,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { apiGet, apiPost } from "../../api.js";
import { pl } from "../../stores/playlist.js";
import { playIndex } from "../../stores/player.js";
import { canReachServer } from "../../connectivity.js";
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
  disableDownloads,
  downloadsStorageLine as formatDlStorage,
  enableDownloads,
  openDownloadsManager,
  refreshStorageInfo,
} from "../../downloads/index.js";
import { downloads } from "../../downloads/state.js";
import Icon from "../icons/Icon.js";
import QualitySelect from "./QualitySelect.js";

const SAME_AS_WIFI = "__same_as_wifi__";

export default defineComponent({
  name: "SettingsModal",
  components: { Icon, QualitySelect },
  setup() {
    const statusText = ref("—");
    const progressPct = ref(0);
    const showProgress = ref(false);
    const scanning = ref(false);
    const downloadsBusy = ref(false);
    /** @type {import('vue').Ref<string|null>} */
    const openMenu = ref(null);
    const qualityRoot = ref(null);
    let pollTimer = null;

    const libraryReachable = computed(() => {
      void downloads.connectivity;
      return canReachServer();
    });

    const showNetworkQuality = computed(
      () => settings.canDetectConnectionType
    );

    function stopPoll() {
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function startPoll() {
      stopPoll();
      if (!libraryReachable.value) return;
      pollTimer = setInterval(refreshScanStatus, 1000);
    }

    async function refreshScanStatus() {
      if (!libraryReachable.value) return;
      try {
        const st = await apiGet("/api/library/scan/status");
        const stats = await apiGet("/api/library/stats").catch(() => null);
        const running = st.status === "running" || st.status === "canceling";
        scanning.value = running;

        let line = `Status: ${st.status}`;
        if (st.mode) line += ` (${st.mode})`;
        if (st.phase) line += ` · ${st.phase}`;
        if (running) {
          line += ` · seen ${st.files_seen || 0}`;
          if (st.files_total_hint) line += ` / ~${st.files_total_hint}`;
          line += ` · updated ${st.files_upserted || 0}`;
        } else if (st.finished_at) {
          line += ` · last finished ${st.finished_at}`;
        }
        if (stats) {
          line += `\nIndexed: ${stats.tracks} tracks · ${stats.albums} albums · ${stats.artists} artists`;
          if (stats.missing_tracks) line += ` · ${stats.missing_tracks} missing`;
        }
        if (st.last_error) line += `\nError: ${st.last_error}`;
        statusText.value = line;

        if (running && st.files_total_hint) {
          showProgress.value = true;
          progressPct.value = Math.min(
            100,
            Math.round(((st.files_seen || 0) / st.files_total_hint) * 100)
          );
        } else if (running) {
          showProgress.value = true;
          progressPct.value = 30;
        } else {
          showProgress.value = false;
          progressPct.value = 0;
        }
      } catch (err) {
        statusText.value = `Scan status unavailable: ${err.message}`;
      }
    }

    async function startScan(mode) {
      if (!libraryReachable.value) return;
      try {
        await apiPost("/api/library/scan", { mode });
        await refreshScanStatus();
        startPoll();
      } catch (err) {
        console.error(err);
        statusText.value = `Could not start scan: ${err.message}`;
      }
    }

    async function cancelScan() {
      if (!libraryReachable.value) return;
      try {
        await apiPost("/api/library/scan/cancel", {});
        await refreshScanStatus();
      } catch (err) {
        console.error(err);
      }
    }

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
    /** selectedId for cellular: SAME_AS_WIFI token when null */
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

    async function onToggleDownloads(e) {
      const want = e.target.checked;
      if (want === downloads.enabled) return;
      downloadsBusy.value = true;
      try {
        if (want) {
          await enableDownloads();
          await refreshStorageInfo();
        } else {
          if (
            !confirm(
              "Disable downloads? You can keep files on this device or delete them."
            )
          ) {
            e.target.checked = true;
            return;
          }
          const wipe = confirm(
            "Delete all downloaded music from this device?\n\nOK = Delete everything\nCancel = Keep files (idle until re-enabled)"
          );
          await disableDownloads({ wipe });
        }
      } catch (err) {
        console.error(err);
        alert(err.message || "Could not update downloads setting");
        e.target.checked = downloads.enabled;
      } finally {
        downloadsBusy.value = false;
      }
    }

    function onOpenManager() {
      closeSettings();
      openDownloadsManager();
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

    function syncLibrarySection() {
      if (!settings.open) {
        stopPoll();
        return;
      }
      if (libraryReachable.value) {
        refreshScanStatus();
        startPoll();
      } else {
        stopPoll();
        scanning.value = false;
        showProgress.value = false;
      }
    }

    watch(
      () => settings.open,
      (open) => {
        if (open) {
          syncLibrarySection();
          if (downloads.enabled) refreshStorageInfo();
          document.addEventListener("keydown", onKey);
          document.addEventListener("pointerdown", onDocPointer, true);
        } else {
          openMenu.value = null;
          stopPoll();
          document.removeEventListener("keydown", onKey);
          document.removeEventListener("pointerdown", onDocPointer, true);
        }
      }
    );

    watch(libraryReachable, () => {
      if (settings.open) syncLibrarySection();
    });

    onUnmounted(() => {
      stopPoll();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDocPointer, true);
    });

    const progressStyle = computed(() => ({
      width: `${progressPct.value}%`,
    }));

    return {
      settings,
      downloads,
      libraryReachable,
      showNetworkQuality,
      statusText,
      showProgress,
      progressStyle,
      scanning,
      downloadsBusy,
      downloadsStorageLine,
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
      startScan,
      cancelScan,
      onToggleDownloads,
      onOpenManager,
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
          ><Icon name="chevron-down" /></button>
        </div>

        <div class="modal-section" ref="qualityRoot">
          <div class="modal-section-title">Quality</div>
          <p class="modal-hint">
            Choose streaming quality
            <template v-if="showNetworkQuality"> for Wi‑Fi and mobile data</template>.
            Downloads use their own quality setting.
          </p>

          <QualitySelect
            menu-id="wifi"
            label-id="wifi-codec-label"
            field-label="Streaming — Wi‑Fi"
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
          <div class="scan-actions" style="margin-top:10px">
            <button
              type="button"
              class="pill"
              :disabled="!downloads.enabled && !downloads.trackCount"
              @click="onOpenManager"
            >Download manager</button>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">Library index</div>
          <template v-if="libraryReachable">
            <p class="modal-hint" style="white-space: pre-wrap">{{ statusText }}</p>
            <div class="scan-actions">
              <button type="button" class="pill" :disabled="scanning" @click="startScan('quick')">Quick rescan</button>
              <button type="button" class="pill" :disabled="scanning" @click="startScan('full')">Full re-index</button>
              <button
                v-if="scanning"
                type="button"
                class="pill danger"
                @click="cancelScan"
              >Cancel</button>
            </div>
            <div class="scan-progress-wrap" :class="{ hidden: !showProgress }">
              <div class="scan-progress-bar" :style="progressStyle"></div>
            </div>
          </template>
          <p v-else class="modal-hint">Go online to manage this section</p>
        </div>
      </div>
    </div>
  `,
});
