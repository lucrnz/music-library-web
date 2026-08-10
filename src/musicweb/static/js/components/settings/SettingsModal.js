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
  settings,
  closeSettings,
  setStreamCodec,
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

export default defineComponent({
  name: "SettingsModal",
  components: { Icon },
  setup() {
    const statusText = ref("—");
    const progressPct = ref(0);
    const showProgress = ref(false);
    const scanning = ref(false);
    const downloadsBusy = ref(false);
    const codecOpen = ref(false);
    const codecRoot = ref(null);
    let pollTimer = null;

    /** Server reachable for library scan/index management. */
    const libraryReachable = computed(() => {
      // Depend on reactive connectivity mirror; then re-check navigator/state.
      void downloads.connectivity;
      return canReachServer();
    });

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

    const streamLabel = computed(() => {
      const id = settings.stream;
      const hit = settings.options.find((o) => o.id === id);
      return hit?.label || id || "—";
    });

    function chooseCodec(id) {
      codecOpen.value = false;
      setStreamCodec(id, {
        tracks: pl.tracks,
        index: pl.index,
        playIndex,
      });
    }

    function toggleCodecMenu() {
      codecOpen.value = !codecOpen.value;
    }

    function onCodecDocPointer(e) {
      if (!codecOpen.value) return;
      const el = codecRoot.value;
      if (el && !el.contains(e.target)) codecOpen.value = false;
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
      if (codecOpen.value) {
        codecOpen.value = false;
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
          document.addEventListener("pointerdown", onCodecDocPointer, true);
        } else {
          codecOpen.value = false;
          stopPoll();
          document.removeEventListener("keydown", onKey);
          document.removeEventListener("pointerdown", onCodecDocPointer, true);
        }
      }
    );

    watch(libraryReachable, () => {
      if (settings.open) syncLibrarySection();
    });

    onUnmounted(() => {
      stopPoll();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onCodecDocPointer, true);
    });

    const progressStyle = computed(() => ({
      width: `${progressPct.value}%`,
    }));

    return {
      settings,
      downloads,
      libraryReachable,
      statusText,
      showProgress,
      progressStyle,
      scanning,
      downloadsBusy,
      downloadsStorageLine,
      codecOpen,
      codecRoot,
      streamLabel,
      closeSettings,
      chooseCodec,
      toggleCodecMenu,
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
        <div class="modal-section">
          <div class="modal-section-title" id="codec-label">Streaming quality</div>
          <div
            ref="codecRoot"
            class="codec-dropdown"
            :class="{ open: codecOpen }"
          >
            <button
              type="button"
              class="codec-trigger"
              aria-haspopup="listbox"
              :aria-expanded="codecOpen ? 'true' : 'false'"
              aria-labelledby="codec-label"
              aria-controls="codec-listbox"
              @click="toggleCodecMenu"
            >
              <span class="codec-trigger-label">{{ streamLabel }}</span>
              <Icon name="chevron-down" />
            </button>
            <ul
              v-show="codecOpen"
              id="codec-listbox"
              class="codec-menu"
              role="listbox"
              aria-labelledby="codec-label"
            >
              <li
                v-for="opt in settings.options"
                :key="opt.id"
                role="option"
                class="codec-option"
                :class="{ selected: opt.id === settings.stream }"
                :aria-selected="opt.id === settings.stream ? 'true' : 'false'"
                tabindex="-1"
                @click="chooseCodec(opt.id)"
              >
                <span class="codec-option-label">{{ opt.label }}</span>
                <Icon v-if="opt.id === settings.stream" name="check" />
              </li>
            </ul>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">Downloads</div>
          <p class="modal-hint">
            Store tracks on this device to save data and play offline.
            Downloads use the streaming quality selected above.
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
