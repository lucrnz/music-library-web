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
import {
  settings,
  closeSettings,
  setStreamCodec,
} from "../../stores/settings.js";
import Icon from "../icons/Icon.js";

export default defineComponent({
  name: "SettingsModal",
  components: { Icon },
  setup() {
    const statusText = ref("—");
    const progressPct = ref(0);
    const showProgress = ref(false);
    const scanning = ref(false);
    let pollTimer = null;

    function stopPoll() {
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function startPoll() {
      stopPoll();
      pollTimer = setInterval(refreshScanStatus, 1000);
    }

    async function refreshScanStatus() {
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
      try {
        await apiPost("/api/library/scan/cancel", {});
        await refreshScanStatus();
      } catch (err) {
        console.error(err);
      }
    }

    function chooseCodec(id) {
      setStreamCodec(id, {
        tracks: pl.tracks,
        index: pl.index,
        playIndex,
      });
    }

    function onKey(e) {
      if (e.key === "Escape" && settings.open) closeSettings();
    }

    watch(
      () => settings.open,
      (open) => {
        if (open) {
          refreshScanStatus();
          startPoll();
          document.addEventListener("keydown", onKey);
        } else {
          stopPoll();
          document.removeEventListener("keydown", onKey);
        }
      }
    );

    onUnmounted(() => {
      stopPoll();
      document.removeEventListener("keydown", onKey);
    });

    const progressStyle = computed(() => ({
      width: `${progressPct.value}%`,
    }));

    return {
      settings,
      statusText,
      showProgress,
      progressStyle,
      scanning,
      closeSettings,
      chooseCodec,
      startScan,
      cancelScan,
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
          <div class="modal-section-title">Streaming quality</div>
          <div class="codec-list" role="radiogroup" aria-label="Stream codec">
            <button
              v-for="opt in settings.options"
              :key="opt.id"
              type="button"
              class="codec-option"
              role="radio"
              :aria-checked="opt.id === settings.stream"
              @click="chooseCodec(opt.id)"
            >
              <span class="codec-label">{{ opt.label }}</span>
              <svg class="icon codec-check" aria-hidden="true"><use href="#i-check"></use></svg>
            </button>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-section-title">Library index</div>
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
        </div>
      </div>
    </div>
  `,
});
