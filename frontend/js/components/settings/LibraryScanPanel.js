/**
 * Library index scan controls for Settings modal.
 */
import {
  computed,
  defineComponent,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { apiGet, apiPost } from "../../api.js";

export default defineComponent({
  name: "LibraryScanPanel",
  props: {
    /** When true, poll status (settings open + server reachable). */
    active: { type: Boolean, default: false },
    libraryReachable: { type: Boolean, default: true },
  },
  setup(props) {
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
      if (!props.libraryReachable || !props.active) return;
      pollTimer = setInterval(refreshScanStatus, 1000);
    }

    async function refreshScanStatus() {
      if (!props.libraryReachable) return;
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
      if (!props.libraryReachable) return;
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
      if (!props.libraryReachable) return;
      try {
        await apiPost("/api/library/scan/cancel", {});
        await refreshScanStatus();
      } catch (err) {
        console.error(err);
      }
    }

    function sync() {
      if (!props.active) {
        stopPoll();
        return;
      }
      if (props.libraryReachable) {
        refreshScanStatus();
        startPoll();
      } else {
        stopPoll();
        scanning.value = false;
        showProgress.value = false;
      }
    }

    watch(
      () => [props.active, props.libraryReachable],
      () => sync(),
      { immediate: true }
    );

    onUnmounted(stopPoll);

    const progressStyle = computed(() => ({
      width: `${progressPct.value}%`,
    }));

    return {
      statusText,
      showProgress,
      progressStyle,
      scanning,
      startScan,
      cancelScan,
    };
  },
  template: `
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
  `,
});
