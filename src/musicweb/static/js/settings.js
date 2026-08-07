/**
 * Settings modal: streaming-quality codec catalog (fetched once at boot
 * from GET /api/codecs), persistence of the preference, and applying a
 * codec change to the playlist.
 */
import { $, settingsModal, codecList } from "./dom.js";
import { apiGet, requestPrepare, preparedKeys } from "./api.js";
import { pl, codec } from "./state.js";
import { playIndex } from "./player.js";

const CODEC_STORAGE_KEY = "musicweb.streamCodec";

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
  settingsModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeSettings() {
  settingsModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
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
  requestPrepare(
    pl.tracks.map((t) => t.path),
    v,
    { replace: true }
  );
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
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settingsModal.classList.contains("hidden")) {
    closeSettings();
  }
});
