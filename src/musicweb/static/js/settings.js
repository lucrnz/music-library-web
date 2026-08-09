/**
 * Settings modal: streaming-quality codec catalog (fetched once at boot
 * from GET /api/codecs), persistence of the preference, applying a
 * codec change to the playlist, and library scan controls.
 */
import { $, settingsModal, codecList } from "./dom.js";
import { apiGet, apiPost, requestPrepare, preparedKeys } from "./api.js";
import { pl, codec } from "./state.js";
import { playIndex } from "./player.js";

const CODEC_STORAGE_KEY = "musicweb.streamCodec";
let scanPollTimer = null;

/** Validate the stored preference against the fetched codec catalog. */
function loadStreamCodec() {
  try {
    const raw = localStorage.getItem(CODEC_STORAGE_KEY);
    codec.stream =
      raw != null && codec.options.some((o) => o.id === raw) ? raw : codec.default;
  } catch {
    codec.stream = codec.default;
  }
}

function saveStreamCodec() {
  try {
    localStorage.setItem(CODEC_STORAGE_KEY, codec.stream);
  } catch {
    /* ignore quota */
  }
}

/** Fetch the codec catalog once at boot, then apply the stored preference. */
export async function loadCodecs() {
  try {
    const data = await apiGet("/api/codecs");
    if (Array.isArray(data.codecs) && data.codecs.length) {
      codec.options = data.codecs;
    }
    if (typeof data.default === "string" && data.default) {
      codec.default = data.default;
    }
  } catch (err) {
    // Keep the hardcoded fallback entry so the player still works.
    console.error("Failed to load codec list", err);
  }
  loadStreamCodec();
}

function renderCodecList() {
  codecList.innerHTML = "";
  for (const opt of codec.options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "codec-option";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(opt.id === codec.stream));
    btn.innerHTML =
      `<span class="codec-label"></span>` +
      `<svg class="icon codec-check" aria-hidden="true"><use href="#i-check"></use></svg>`;
    btn.querySelector(".codec-label").textContent = opt.label;
    btn.addEventListener("click", () => setStreamCodec(opt.id));
    codecList.appendChild(btn);
  }
}

function openSettings() {
  renderCodecList();
  refreshScanStatus();
  startScanPoll();
  settingsModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeSettings() {
  settingsModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  stopScanPoll();
}

function stopScanPoll() {
  if (scanPollTimer != null) {
    clearInterval(scanPollTimer);
    scanPollTimer = null;
  }
}

function startScanPoll() {
  stopScanPoll();
  scanPollTimer = setInterval(refreshScanStatus, 1000);
}

async function refreshScanStatus() {
  const textEl = $("scan-status-text");
  const barWrap = $("scan-progress-wrap");
  const bar = $("scan-progress-bar");
  const btnCancel = $("btn-scan-cancel");
  if (!textEl) return;
  try {
    const st = await apiGet("/api/library/scan/status");
    const stats = await apiGet("/api/library/stats").catch(() => null);
    const running = st.status === "running" || st.status === "canceling";
    btnCancel?.classList.toggle("hidden", !running);
    $("btn-scan-quick")?.toggleAttribute("disabled", running);
    $("btn-scan-full")?.toggleAttribute("disabled", running);

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
    textEl.textContent = line;

    if (running && st.files_total_hint) {
      barWrap?.classList.remove("hidden");
      const pct = Math.min(
        100,
        Math.round(((st.files_seen || 0) / st.files_total_hint) * 100)
      );
      if (bar) bar.style.width = `${pct}%`;
    } else if (running) {
      barWrap?.classList.remove("hidden");
      if (bar) bar.style.width = "30%";
    } else {
      barWrap?.classList.add("hidden");
      if (bar) bar.style.width = "0%";
    }
  } catch (err) {
    textEl.textContent = `Scan status unavailable: ${err.message}`;
  }
}

async function startScan(mode) {
  try {
    await apiPost("/api/library/scan", { mode });
    refreshScanStatus();
    startScanPoll();
  } catch (err) {
    console.error(err);
    const textEl = $("scan-status-text");
    if (textEl) textEl.textContent = `Could not start scan: ${err.message}`;
  }
}

async function cancelScan() {
  try {
    await apiPost("/api/library/scan/cancel", {});
    refreshScanStatus();
  } catch (err) {
    console.error(err);
  }
}

function setStreamCodec(v) {
  if (!codec.options.some((o) => o.id === v)) return;
  if (v === codec.stream) {
    closeSettings();
    return;
  }
  codec.stream = v;
  saveStreamCodec();
  closeSettings();
  // Re-transcode the whole playlist with the new codec: drop stale-codec
  // pending jobs (replace) and requeue everything in playlist order. The
  // playIndex reload below makes the current track urgent, so it goes first.
  preparedKeys.clear();
  requestPrepare(pl.tracks, v, { replace: true });
  // Reload current track so the user gets the new codec stream.
  if (pl.index >= 0) {
    playIndex(pl.index);
  }
}

// The player-bar button is unreachable before playback starts (and hidden
// behind the now-playing sheet on mobile), so the library view-bar carries
// its own entry point to the same modal.
for (const id of ["btn-settings", "btn-settings-lib"]) {
  $(id).addEventListener("click", openSettings);
}
$("btn-settings-close").addEventListener("click", closeSettings);
$("settings-backdrop").addEventListener("click", closeSettings);
$("btn-scan-quick")?.addEventListener("click", () => startScan("quick"));
$("btn-scan-full")?.addEventListener("click", () => startScan("full"));
$("btn-scan-cancel")?.addEventListener("click", cancelScan);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settingsModal.classList.contains("hidden")) {
    closeSettings();
  }
});
