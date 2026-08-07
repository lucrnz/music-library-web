/**
 * Modern streaming-app client: drill-down library + playlist + HTML5 player.
 * Mobile-first: tabs + mini-player/now-playing sheet on phones, two-pane
 * layout + persistent player bar on desktop (via CSS min-width queries).
 * Playlist state is client-only (sessionStorage).
 */
(() => {
  "use strict";

  const STORAGE_KEY = "musicweb.playlist.v1";
  const CODEC_STORAGE_KEY = "musicweb.streamCodec";
  const PLACEHOLDER_COVER = "/static/img/placeholder.svg";
  const CODEC_OPTIONS = [
    { id: "aac_256_44100", label: "AAC 256k", detail: "44.1 kHz" },
    { id: "opus_192_48000", label: "Opus 192k", detail: "48 kHz" },
    { id: "opus_160_48000", label: "Opus 160k", detail: "48 kHz" },
    { id: "flac_16_44100", label: "FLAC", detail: "44.1 kHz · lossless" },
    { id: "flac_16_48000", label: "FLAC", detail: "48 kHz · lossless" },
  ];
  const ALLOWED_CODECS = new Set(CODEC_OPTIONS.map((o) => o.id));
  const DEFAULT_CODEC = "aac_256_44100";

  // ── State ──────────────────────────────────────────────────────────
  /** @type {{ path: string, title: string, artist: string, album: string, duration: number|null }[]} */
  let playlist = [];
  let currentIndex = -1;
  let shuffle = false;
  /** @type {'off'|'one'|'all'} */
  let repeat = "off";
  /** @type {number[]} */
  let shuffleOrder = [];
  let shufflePos = -1;
  let seeking = false;
  /** Stream profile tag for /api/stream (?codec=). */
  let streamCodec = DEFAULT_CODEC;

  /** "path|codec" pairs already sent to /api/transcode/prepare this session. */
  const preparedKeys = new Set();

  /** Library navigation stack: [{ path, name }] — empty means library root. */
  let navStack = [];
  /** Desktop multi-select in the library: path -> 'dir' | 'file' */
  const libSelected = new Map();
  /** Playlist edit mode (delete / reorder / clear). */
  let plEditing = false;

  const desktopMQ = window.matchMedia("(min-width: 900px)");

  // ── DOM ────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const dirList = $("dir-list");
  const plList = $("pl-list");
  const audio = $("audio");
  const player = $("player");
  const coverArt = $("cover-art");
  const coverArtFull = $("cover-art-full");
  const npTitle = $("np-title");
  const npArtist = $("np-artist");
  const npTitleFull = $("np-title-full");
  const npArtistFull = $("np-artist-full");
  const timeCur = $("time-cur");
  const timeTotal = $("time-total");
  const seek = $("seek");
  const volume = $("volume");
  const settingsModal = $("settings-modal");
  const codecList = $("codec-list");
  const btnPlay = $("btn-play");
  const btnPlayMini = $("btn-play-mini");
  const btnShuffle = $("btn-shuffle");
  const btnRepeat = $("btn-repeat");
  const btnBack = $("btn-back");
  const btnAddAll = $("btn-add-all");
  const btnAddSelected = $("btn-add-selected");
  const btnEdit = $("btn-edit");
  const btnClear = $("btn-clear");
  const libraryTitle = $("library-title");
  const viewLibrary = $("view-library");
  const viewPlaylist = $("view-playlist");
  const tabLibrary = $("tab-library");
  const tabPlaylist = $("tab-playlist");

  // ── Helpers ────────────────────────────────────────────────────────
  function formatTime(sec) {
    if (sec == null || !Number.isFinite(sec) || sec < 0) return "0:00";
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function encodePath(path) {
    return encodeURIComponent(path);
  }

  /** @param {string} path @param {'full'|'thumb'} size @param {boolean} bust cache-bust with a timestamp */
  function coverUrl(path, size, bust = true) {
    const base = `/api/cover?path=${encodePath(path)}&size=${size}`;
    return bust ? `${base}&t=${Date.now()}` : base;
  }

  function icon(name) {
    return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function setIcon(btn, name) {
    btn.querySelector("use").setAttribute("href", `#i-${name}`);
  }

  async function apiGet(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(detail || res.statusText);
    }
    return res.json();
  }

  function savePlaylist() {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ playlist, currentIndex, shuffle, repeat })
      );
    } catch {
      /* ignore quota */
    }
  }

  function loadPlaylist() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.playlist)) playlist = data.playlist;
      if (typeof data.currentIndex === "number") currentIndex = data.currentIndex;
      if (typeof data.shuffle === "boolean") shuffle = data.shuffle;
      if (data.repeat === "off" || data.repeat === "one" || data.repeat === "all") {
        repeat = data.repeat;
      }
    } catch {
      /* ignore */
    }
  }

  // ── Tabs (mobile) ──────────────────────────────────────────────────
  function switchTab(name) {
    tabLibrary.classList.toggle("active", name === "library");
    tabPlaylist.classList.toggle("active", name === "playlist");
    viewLibrary.classList.toggle("hidden", name !== "library");
    viewPlaylist.classList.toggle("hidden", name !== "playlist");
  }

  tabLibrary.addEventListener("click", () => switchTab("library"));
  tabPlaylist.addEventListener("click", () => switchTab("playlist"));

  // ── Library (drill-down) ───────────────────────────────────────────
  function currentPath() {
    return navStack.length ? navStack[navStack.length - 1].path : "";
  }

  function clearLibSelection() {
    libSelected.clear();
    dirList.querySelectorAll(".row.selected").forEach((el) => {
      el.classList.remove("selected");
    });
    syncLibActions();
  }

  function syncLibActions() {
    btnAddSelected.classList.toggle("hidden", libSelected.size === 0);
  }

  async function renderDir() {
    const path = currentPath();
    libSelected.clear();
    syncLibActions();
    btnBack.classList.toggle("hidden", navStack.length === 0);
    libraryTitle.textContent = navStack.length
      ? navStack[navStack.length - 1].name
      : "Library";
    dirList.innerHTML = "";

    let data;
    try {
      data = await apiGet(`/api/browse?path=${encodePath(path)}`);
    } catch (err) {
      dirList.innerHTML = "";
      const errEl = document.createElement("div");
      errEl.className = "list-empty";
      errEl.textContent = `Error: ${err.message}`;
      dirList.appendChild(errEl);
      return;
    }

    if (!data.dirs.length && !data.files.length) {
      const empty = document.createElement("div");
      empty.className = "list-empty";
      empty.textContent = "This folder is empty";
      dirList.appendChild(empty);
      return;
    }

    for (const dir of data.dirs) {
      dirList.appendChild(createDirRow(dir));
    }
    for (const file of data.files) {
      dirList.appendChild(createFileRow(file));
    }
  }

  /** Desktop Ctrl/Cmd-click multi-select; returns true if the click was a selection. */
  function maybeSelectRow(row, path, kind, e) {
    if (!(e.metaKey || e.ctrlKey)) return false;
    if (libSelected.has(path)) {
      libSelected.delete(path);
      row.classList.remove("selected");
    } else {
      libSelected.set(path, kind);
      row.classList.add("selected");
    }
    syncLibActions();
    return true;
  }

  function createDirRow(dir) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.path = dir.path;
    row.innerHTML = `
      <span class="row-icon">${icon("folder")}</span>
      <span class="row-meta">
        <span class="row-title"></span>
      </span>
      <span class="row-chevron">${icon("chevron-right")}</span>
    `;
    row.querySelector(".row-title").textContent = dir.name;

    row.addEventListener("click", (e) => {
      if (maybeSelectRow(row, dir.path, "dir", e)) return;
      navStack.push({ path: dir.path, name: dir.name });
      renderDir();
    });
    return row;
  }

  function createFileRow(file) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.path = file.path;
    row.innerHTML = `
      <span class="row-icon">${icon("note")}</span>
      <span class="row-meta">
        <span class="row-title"></span>
      </span>
      <button type="button" class="icon-btn row-add" title="Add to playlist" aria-label="Add to playlist">${icon("plus")}</button>
    `;
    row.querySelector(".row-title").textContent = file.name;

    row.addEventListener("click", async (e) => {
      if (maybeSelectRow(row, file.path, "file", e)) return;
      const startPlay = playlist.length === 0 || audio.paused;
      await addPathsToPlaylist([file.path]);
      if (startPlay) {
        playIndex(playlist.length - 1);
      }
    });

    row.querySelector(".row-add").addEventListener("click", async (e) => {
      e.stopPropagation();
      await addPathsToPlaylist([file.path]);
    });
    return row;
  }

  btnBack.addEventListener("click", () => {
    if (!navStack.length) return;
    navStack.pop();
    renderDir();
  });

  btnAddAll.addEventListener("click", async () => {
    try {
      const data = await apiGet(`/api/collect?path=${encodePath(currentPath())}`);
      await addPathsToPlaylist(data.files);
    } catch (err) {
      console.error(err);
    }
  });

  btnAddSelected.addEventListener("click", async () => {
    if (!libSelected.size) return;
    const files = [];
    for (const [p, kind] of libSelected) {
      if (kind === "dir") {
        try {
          const data = await apiGet(`/api/collect?path=${encodePath(p)}`);
          files.push(...data.files);
        } catch (err) {
          console.error(err);
        }
      } else {
        files.push(p);
      }
    }
    clearLibSelection();
    await addPathsToPlaylist(files);
  });

  // ── Playlist ───────────────────────────────────────────────────────
  async function fetchMeta(path) {
    try {
      return await apiGet(`/api/meta?path=${encodePath(path)}`);
    } catch {
      const name = path.split("/").pop() || path;
      return {
        path,
        title: name.replace(/\.[^.]+$/, ""),
        artist: "",
        album: "",
        duration: null,
      };
    }
  }

  /**
   * Fire-and-forget prewarm: ask the server to background-transcode paths
   * with the current codec. Playback never depends on this — /api/stream
   * transcodes on demand and preempts this queue.
   */
  function requestPrepare(paths, { replace = false } = {}) {
    const fresh = paths.filter((p) => !preparedKeys.has(`${p}|${streamCodec}`));
    if (!fresh.length && !replace) return;
    const wanted = replace ? paths : fresh;
    if (!wanted.length) return;
    wanted.forEach((p) => preparedKeys.add(`${p}|${streamCodec}`));
    fetch("/api/transcode/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: wanted, codec: streamCodec, replace }),
    }).catch(() => {});
  }

  async function addPathsToPlaylist(paths) {
    if (!paths.length) return;
    for (const path of paths) {
      const meta = await fetchMeta(path);
      playlist.push({
        path,
        title: meta.title || path,
        artist: meta.artist || "",
        album: meta.album || "",
        duration: meta.duration ?? null,
      });
    }
    rebuildShuffleOrder(false);
    renderPlaylist();
    updateNowPlaying();
    savePlaylist();
    requestPrepare(paths);
  }

  function removeIndices(indices) {
    if (!indices.length) return;
    const removingCurrent = indices.includes(currentIndex);
    for (const i of [...indices].sort((a, b) => b - a)) {
      playlist.splice(i, 1);
      if (i < currentIndex) currentIndex -= 1;
      else if (i === currentIndex) currentIndex = -1;
    }
    if (currentIndex >= playlist.length) currentIndex = playlist.length - 1;
    rebuildShuffleOrder(true);
    renderPlaylist();
    savePlaylist();
    if (removingCurrent) {
      if (playlist.length && currentIndex >= 0) playIndex(currentIndex);
      else stopPlayback();
    }
  }

  function clearPlaylist() {
    playlist = [];
    currentIndex = -1;
    shuffleOrder = [];
    shufflePos = -1;
    renderPlaylist();
    savePlaylist();
    stopPlayback();
    // Cached transcodes only exist to serve the playlist — wipe them too.
    preparedKeys.clear();
    fetch("/api/cache/clear", { method: "POST" }).catch(() => {});
  }

  function renderPlaylist() {
    plList.innerHTML = "";
    plList.classList.toggle("editing", plEditing);
    btnEdit.querySelector("span").textContent = plEditing ? "Done" : "Edit";
    btnClear.classList.toggle("hidden", !plEditing || !playlist.length);

    if (!playlist.length) {
      const empty = document.createElement("div");
      empty.className = "list-empty";
      empty.textContent = plEditing
        ? "Playlist is empty"
        : "Playlist empty — tap tracks in the Library to add them";
      plList.appendChild(empty);
      return;
    }

    playlist.forEach((track, index) => {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.index = String(index);
      if (index === currentIndex) row.classList.add("playing");

      const sub = [track.artist, track.album].filter(Boolean).join(" — ");
      row.innerHTML = `
        <button type="button" class="icon-btn row-delete" title="Remove" aria-label="Remove from playlist">${icon("trash")}</button>
        <span class="row-cover-wrap">
          <img class="row-cover" src="${coverUrl(track.path, "thumb", false)}" alt="" loading="lazy" />
          ${index === currentIndex
            ? `<span class="eq${audio.paused ? " paused" : ""}"><span></span><span></span><span></span></span>`
            : ""}
        </span>
        <span class="row-meta">
          <span class="row-title"></span>
          <span class="row-sub"></span>
        </span>
        <span class="row-dur">${formatTime(track.duration)}</span>
        <span class="row-drag" title="Drag to reorder" aria-label="Drag to reorder">${icon("drag")}</span>
      `;
      row.querySelector(".row-title").textContent = track.title;
      row.querySelector(".row-sub").textContent = sub;

      row.addEventListener("click", (e) => {
        if (plEditing) return;
        if (e.target.closest(".row-delete") || e.target.closest(".row-drag")) return;
        playIndex(index);
      });

      row.querySelector(".row-delete").addEventListener("click", () => {
        removeIndices([index]);
      });

      row.querySelector(".row-drag").addEventListener("pointerdown", (e) => {
        startDragReorder(e, row, index);
      });

      plList.appendChild(row);
    });
  }

  /** Pointer-based drag reorder — works for touch and mouse. */
  function startDragReorder(e, row, fromIndex) {
    e.preventDefault();
    let targetIndex = fromIndex;
    let marked = null;
    row.classList.add("dragging");

    const onMove = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const over = el ? el.closest(".row") : null;
      if (marked && marked !== over) marked.classList.remove("drop-target");
      marked = null;
      if (over && over.parentElement === plList && over !== row) {
        targetIndex = Number(over.dataset.index);
        over.classList.add("drop-target");
        marked = over;
      }
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      row.classList.remove("dragging");
      if (marked) marked.classList.remove("drop-target");
      if (targetIndex !== fromIndex) reorderPlaylist(fromIndex, targetIndex);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function reorderPlaylist(from, to) {
    const [item] = playlist.splice(from, 1);
    playlist.splice(to, 0, item);
    if (currentIndex === from) currentIndex = to;
    else if (from < currentIndex && to >= currentIndex) currentIndex -= 1;
    else if (from > currentIndex && to <= currentIndex) currentIndex += 1;
    rebuildShuffleOrder(true);
    renderPlaylist();
    savePlaylist();
  }

  btnEdit.addEventListener("click", () => {
    plEditing = !plEditing;
    renderPlaylist();
  });

  btnClear.addEventListener("click", clearPlaylist);

  // ── Media Session (OS lock-screen / control-center integration) ────
  const msSupported = "mediaSession" in navigator;

  /** Publish current track metadata (title/artist/album/artwork) to the OS. */
  function updateMediaSession() {
    if (!msSupported) return;
    const t = currentIndex >= 0 ? playlist[currentIndex] : null;
    if (!t) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.album,
      artwork: [
        // Stable (non-cache-busted) URLs so the OS can cache artwork
        { src: coverUrl(t.path, "thumb", false), sizes: "200x200", type: "image/webp" },
        { src: coverUrl(t.path, "full", false), sizes: "800x800", type: "image/webp" },
      ],
    });
  }

  /** Report position/duration so the OS shows an accurate seek bar. */
  function updatePositionState() {
    if (!msSupported || typeof navigator.mediaSession.setPositionState !== "function") {
      return;
    }
    const dur = audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(audio.currentTime, dur),
      });
    } catch {
      /* ignore out-of-range positions */
    }
  }

  if (msSupported) {
    navigator.mediaSession.setActionHandler("play", () => {
      if (currentIndex < 0 && playlist.length) playIndex(0);
      else audio.play().catch(console.error);
    });
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("previoustrack", playPrev);
    navigator.mediaSession.setActionHandler("nexttrack", playNext);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null && Number.isFinite(audio.duration)) {
        audio.currentTime = details.seekTime;
      }
    });
  }

  // ── Playback ───────────────────────────────────────────────────────
  function rebuildShuffleOrder(keepCurrent) {
    const n = playlist.length;
    shuffleOrder = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
    }
    if (keepCurrent && currentIndex >= 0) {
      shufflePos = shuffleOrder.indexOf(currentIndex);
    } else {
      shufflePos = -1;
    }
  }

  function updateTransportUI() {
    const playing = !audio.paused;
    setIcon(btnPlay, playing ? "pause" : "play");
    setIcon(btnPlayMini, playing ? "pause" : "play");
    btnShuffle.setAttribute("aria-pressed", shuffle ? "true" : "false");
    btnRepeat.dataset.mode = repeat;
    btnRepeat.setAttribute("aria-pressed", repeat !== "off" ? "true" : "false");
    setIcon(btnRepeat, repeat === "one" ? "repeat-one" : "repeat");
    if (msSupported) {
      navigator.mediaSession.playbackState =
        currentIndex >= 0 ? (playing ? "playing" : "paused") : "none";
    }
    plList.querySelectorAll(".eq").forEach((eq) => {
      eq.classList.toggle("paused", !playing);
    });
  }

  function updateNowPlaying() {
    const t = currentIndex >= 0 ? playlist[currentIndex] : null;
    player.classList.toggle("hidden", !t && playlist.length === 0);
    if (!t) {
      npTitle.textContent = "—";
      npArtist.textContent = "No track";
      npTitleFull.textContent = "—";
      npArtistFull.textContent = "No track";
      coverArt.src = PLACEHOLDER_COVER;
      coverArtFull.src = PLACEHOLDER_COVER;
      updateMediaSession();
      return;
    }
    const sub = [t.artist, t.album].filter(Boolean).join(" — ") || "Unknown";
    npTitle.textContent = t.title;
    npArtist.textContent = sub;
    npTitleFull.textContent = t.title;
    npArtistFull.textContent = sub;
    // Mini player: small server-side thumbnail; sheet: full extracted art
    coverArt.src = coverUrl(t.path, "thumb");
    coverArtFull.src = coverUrl(t.path, "full");
    updateMediaSession();
  }

  function stopPlayback() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    currentIndex = -1;
    seek.value = "0";
    timeCur.textContent = "0:00";
    timeTotal.textContent = "0:00";
    updateNowPlaying();
    updateTransportUI();
    renderPlaylist();
    savePlaylist();
  }

  async function playIndex(index) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    if (shuffle) {
      shufflePos = shuffleOrder.indexOf(index);
    }
    const track = playlist[index];
    updateNowPlaying();
    renderPlaylist();
    savePlaylist();

    const url = `/api/stream?path=${encodePath(track.path)}&codec=${encodeURIComponent(streamCodec)}`;
    audio.src = url;
    try {
      await audio.play();
    } catch (err) {
      // Benign cases (e.g. transcode still warming up, autoplay policy)
      // surface here; the audio element retries/recovers on its own.
      console.error("Playback failed", err);
    }
    updateTransportUI();
  }

  function nextIndex() {
    if (!playlist.length) return -1;
    if (repeat === "one") return currentIndex;
    if (shuffle) {
      if (!shuffleOrder.length) rebuildShuffleOrder(false);
      shufflePos += 1;
      if (shufflePos >= shuffleOrder.length) {
        if (repeat === "all") {
          rebuildShuffleOrder(false);
          shufflePos = 0;
        } else {
          return -1;
        }
      }
      return shuffleOrder[shufflePos];
    }
    const next = currentIndex + 1;
    if (next < playlist.length) return next;
    if (repeat === "all") return 0;
    return -1;
  }

  function prevIndex() {
    if (!playlist.length) return -1;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return currentIndex;
    }
    if (shuffle) {
      if (shufflePos > 0) {
        shufflePos -= 1;
        return shuffleOrder[shufflePos];
      }
      return currentIndex;
    }
    if (currentIndex > 0) return currentIndex - 1;
    if (repeat === "all") return playlist.length - 1;
    return currentIndex;
  }

  function playNext() {
    const idx = nextIndex();
    if (idx < 0) {
      audio.pause();
      updateTransportUI();
      return;
    }
    playIndex(idx);
  }

  function playPrev() {
    const idx = prevIndex();
    if (idx >= 0) playIndex(idx);
  }

  function togglePlay() {
    if (!playlist.length) return;
    if (currentIndex < 0) {
      playIndex(0);
      return;
    }
    if (audio.paused) audio.play().catch(console.error);
    else audio.pause();
    updateTransportUI();
  }

  // ── Audio events ───────────────────────────────────────────────────
  audio.addEventListener("play", updateTransportUI);
  audio.addEventListener("pause", updateTransportUI);
  audio.addEventListener("ended", () => {
    if (repeat === "one") {
      audio.currentTime = 0;
      audio.play().catch(console.error);
      return;
    }
    playNext();
  });
  audio.addEventListener("timeupdate", () => {
    if (seeking) return;
    const dur = audio.duration;
    const cur = audio.currentTime;
    timeCur.textContent = formatTime(cur);
    if (Number.isFinite(dur)) {
      timeTotal.textContent = formatTime(dur);
      seek.value = String(Math.round((cur / dur) * 1000));
    }
    updatePositionState();
  });
  audio.addEventListener("loadedmetadata", () => {
    timeTotal.textContent = formatTime(audio.duration);
    updatePositionState();
    if (currentIndex >= 0 && playlist[currentIndex] && !playlist[currentIndex].duration) {
      playlist[currentIndex].duration = audio.duration;
      renderPlaylist();
      savePlaylist();
    }
  });

  seek.addEventListener("pointerdown", () => {
    seeking = true;
  });
  seek.addEventListener("pointerup", () => {
    seeking = false;
    const dur = audio.duration;
    if (Number.isFinite(dur)) {
      audio.currentTime = (Number(seek.value) / 1000) * dur;
    }
  });
  seek.addEventListener("input", () => {
    const dur = audio.duration;
    if (Number.isFinite(dur)) {
      timeCur.textContent = formatTime((Number(seek.value) / 1000) * dur);
    }
  });

  volume.addEventListener("input", () => {
    audio.volume = Number(volume.value);
  });

  function loadStreamCodec() {
    try {
      let raw = localStorage.getItem(CODEC_STORAGE_KEY);
      if (raw == null) {
        // One-time migration from legacy sessionStorage preferences
        raw = sessionStorage.getItem(CODEC_STORAGE_KEY);
        if (raw == null) {
          const legacy = sessionStorage.getItem("musicweb.sampleRate");
          if (legacy === "48000") raw = "opus_192_48000";
          else if (legacy === "44100") raw = "aac_256_44100";
        }
        if (raw != null && ALLOWED_CODECS.has(raw)) {
          localStorage.setItem(CODEC_STORAGE_KEY, raw);
        }
      }
      if (ALLOWED_CODECS.has(raw)) streamCodec = raw;
    } catch {
      /* ignore */
    }
  }

  function saveStreamCodec() {
    try {
      localStorage.setItem(CODEC_STORAGE_KEY, streamCodec);
    } catch {
      /* ignore quota */
    }
  }

  // ── Settings modal (codec selection) ─────────────────────────────
  function renderCodecList() {
    codecList.innerHTML = "";
    for (const opt of CODEC_OPTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "codec-option";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", String(opt.id === streamCodec));
      btn.innerHTML =
        `<span><span class="codec-label"></span> <span class="codec-detail"></span></span>` +
        `<svg class="icon codec-check" aria-hidden="true"><use href="#i-check"></use></svg>`;
      btn.querySelector(".codec-label").textContent = opt.label;
      btn.querySelector(".codec-detail").textContent = opt.detail;
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
    if (!ALLOWED_CODECS.has(v)) return;
    if (v === streamCodec) {
      closeSettings();
      return;
    }
    streamCodec = v;
    saveStreamCodec();
    closeSettings();
    // Re-transcode the whole playlist with the new codec: drop stale-codec
    // pending jobs (replace) and requeue everything in playlist order. The
    // playIndex reload below makes the current track urgent, so it goes first.
    preparedKeys.clear();
    requestPrepare(playlist.map((t) => t.path), { replace: true });
    // Reload current track so the user gets the new codec stream.
    if (currentIndex >= 0 && currentIndex < playlist.length) {
      playIndex(currentIndex);
    }
  }

  $("btn-settings").addEventListener("click", openSettings);
  $("btn-settings-close").addEventListener("click", closeSettings);
  $("settings-backdrop").addEventListener("click", closeSettings);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsModal.classList.contains("hidden")) {
      closeSettings();
    }
  });

  // ── Transport buttons ──────────────────────────────────────────────
  btnPlay.addEventListener("click", togglePlay);
  btnPlayMini.addEventListener("click", togglePlay);
  $("btn-next").addEventListener("click", playNext);
  $("btn-next-mini").addEventListener("click", playNext);
  $("btn-prev").addEventListener("click", playPrev);

  btnShuffle.addEventListener("click", () => {
    shuffle = !shuffle;
    if (shuffle) rebuildShuffleOrder(true);
    updateTransportUI();
    savePlaylist();
  });

  btnRepeat.addEventListener("click", () => {
    if (repeat === "off") repeat = "all";
    else if (repeat === "all") repeat = "one";
    else repeat = "off";
    updateTransportUI();
    savePlaylist();
  });

  // ── Now-playing sheet (mobile expand / collapse) ───────────────────
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

  // ── Boot ───────────────────────────────────────────────────────────
  loadStreamCodec();
  loadPlaylist();
  renderPlaylist();
  updateTransportUI();
  updateNowPlaying();
  audio.volume = Number(volume.value);
  renderDir().catch(console.error);
})();
