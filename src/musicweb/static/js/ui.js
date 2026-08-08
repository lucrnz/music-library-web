/**
 * Entry point: mobile tabs, the now-playing sheet (expand/collapse/swipe),
 * registration of the UI render callbacks, and boot.
 *
 * Modern streaming-app client: drill-down library + playlist + HTML5 player.
 * Mobile-first: tabs + mini-player/now-playing sheet on phones, two-pane
 * layout + persistent player bar on desktop (via CSS min-width queries).
 * Playlist state is client-only (sessionStorage).
 */
import {
  $,
  tabLibrary,
  tabPlaylist,
  viewLibrary,
  viewPlaylist,
  player,
  audio,
  volume,
  seek,
} from "./dom.js";
import { render, loadPlaylist } from "./state.js";
import { updateNowPlaying, updateTransportUI, setRangeFill } from "./player.js";
import { renderPlaylist } from "./playlist.js";
import { renderDir } from "./browser.js";
import { loadCodecs } from "./settings.js";

// Keep in sync with the desktop media query in app.css ("Desktop enhancement").
const DESKTOP_BREAKPOINT = "(min-width: 900px)";
const desktopMQ = window.matchMedia(DESKTOP_BREAKPOINT);

// ── Tabs (mobile) ────────────────────────────────────────────────────
function switchTab(name) {
  tabLibrary.classList.toggle("active", name === "library");
  tabPlaylist.classList.toggle("active", name === "playlist");
  viewLibrary.classList.toggle("hidden", name !== "library");
  viewPlaylist.classList.toggle("hidden", name !== "playlist");
}

tabLibrary.addEventListener("click", () => switchTab("library"));
tabPlaylist.addEventListener("click", () => switchTab("playlist"));

// ── Now-playing sheet (mobile expand / collapse) ─────────────────────
$("btn-expand").addEventListener("click", () => {
  if (desktopMQ.matches) return;
  player.classList.add("expanded");
});

function collapseSheet() {
  player.classList.remove("expanded");
  player.style.transform = "";
}

$("btn-collapse").addEventListener("click", collapseSheet);

// Swipe-down to dismiss the sheet
const sheetGrab = $("sheet-grab");
let sheetDragY = null;

sheetGrab.addEventListener("pointerdown", (e) => {
  sheetDragY = e.clientY;
  player.classList.add("dragging");
  sheetGrab.setPointerCapture(e.pointerId);
});
sheetGrab.addEventListener("pointermove", (e) => {
  if (sheetDragY === null) return;
  const dy = Math.max(0, e.clientY - sheetDragY);
  player.style.transform = `translateY(${dy}px)`;
});
sheetGrab.addEventListener("pointerup", (e) => {
  if (sheetDragY === null) return;
  const dy = e.clientY - sheetDragY;
  sheetDragY = null;
  player.classList.remove("dragging");
  if (dy > 100) collapseSheet();
  else player.style.transform = "";
});

// Collapse the sheet if the viewport grows to desktop width
desktopMQ.addEventListener("change", (e) => {
  if (e.matches) collapseSheet();
});

// ── Boot ───────────────────────────────────────────────────────────────
// Register the render callbacks before anything can call commit() (see
// state.js for why renders are registered here instead of imported there).
render.sync = () => {
  renderPlaylist();
  updateNowPlaying();
  updateTransportUI();
};
render.playlist = renderPlaylist;

loadPlaylist();
render.sync();
audio.volume = Number(volume.value);
setRangeFill(volume);
setRangeFill(seek);
renderDir().catch(console.error);
loadCodecs();
