/**
 * Foobar-style music client: lazy file tree + session playlist + HTML5 player.
 * Playlist state is client-only (sessionStorage).
 */
(() => {
  "use strict";

  const STORAGE_KEY = "musicweb.playlist.v1";
  const CODEC_STORAGE_KEY = "musicweb.streamCodec";
  const PLACEHOLDER_COVER = "/static/img/placeholder.svg";
  const ALLOWED_CODECS = new Set([
    "aac_256_44100",
    "opus_192_48000",
    "opus_160_48000",
    "flac_16_44100",
    "flac_16_48000",
  ]);
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

  /** Tree selection: path -> 'dir' | 'file' */
  const treeSelected = new Map();
  /** Playlist row selection: Set of indices */
  const plSelected = new Set();
  let plLastClicked = -1;

  // ── DOM ────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const treeEl = $("tree");
  const plBody = $("playlist-body");
  const audio = $("audio");
  const coverArt = $("cover-art");
  const libraryCoverArt = $("library-cover-art");
  const libraryCoverPanel = $("library-cover-panel");
  const npTitle = $("np-title");
  const npArtist = $("np-artist");
  const timeCur = $("time-cur");
  const timeTotal = $("time-total");
  const seek = $("seek");
  const volume = $("volume");
  const streamCodecEl = $("stream-codec");
  const btnPlay = $("btn-play");
  const btnShuffle = $("btn-shuffle");
  const btnRepeat = $("btn-repeat");

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

  /** @param {string} path @param {'full'|'thumb'} size */
  function coverUrl(path, size) {
    return `/api/cover?path=${encodePath(path)}&size=${size}&t=${Date.now()}`;
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

  // ── Tree (lazy, filesystem-agnostic) ───────────────────────────────
  function clearTreeSelection() {
    treeSelected.clear();
    treeEl.querySelectorAll(".tree-node.selected").forEach((el) => {
      el.classList.remove("selected");
    });
  }

  function setTreeNodeSelected(nodeEl, path, kind, multi) {
    if (!multi) clearTreeSelection();
    if (treeSelected.has(path) && multi) {
      treeSelected.delete(path);
      nodeEl.classList.remove("selected");
    } else {
      treeSelected.set(path, kind);
      nodeEl.classList.add("selected");
    }
  }

  function makeIndent(depth) {
    return `${8 + depth * 14}px`;
  }

  /**
   * @param {HTMLElement} container
   * @param {string} parentPath
   * @param {number} depth
   */
  async function loadChildren(container, parentPath, depth) {
    container.innerHTML = "";
    let data;
    try {
      data = await apiGet(`/api/browse?path=${encodePath(parentPath)}`);
    } catch (err) {
      const errEl = document.createElement("div");
      errEl.className = "tree-empty";
      errEl.textContent = `Error: ${err.message}`;
      container.appendChild(errEl);
      return;
    }

    if (!data.dirs.length && !data.files.length) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.style.paddingLeft = makeIndent(depth);
      empty.textContent = "(empty)";
      container.appendChild(empty);
      return;
    }

    for (const dir of data.dirs) {
      container.appendChild(createDirNode(dir, depth));
    }
    for (const file of data.files) {
      container.appendChild(createFileNode(file, depth));
    }
  }

  function createDirNode(dir, depth) {
    const wrap = document.createElement("div");
    wrap.className = "tree-dir";
    wrap.dataset.path = dir.path;

    const row = document.createElement("div");
    row.className = "tree-node";
    row.style.paddingLeft = makeIndent(depth);
    row.setAttribute("role", "treeitem");
    row.dataset.path = dir.path;
    row.dataset.kind = "dir";

    const toggle = document.createElement("span");
    toggle.className = "tree-toggle";
    toggle.textContent = "▸";

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = "📁";

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = dir.name;

    row.append(toggle, icon, label);

    const children = document.createElement("div");
    children.className = "tree-children";
    children.dataset.loaded = "0";

    let expanded = false;

    async function expand() {
      if (!expanded) {
        if (children.dataset.loaded !== "1") {
          await loadChildren(children, dir.path, depth + 1);
          children.dataset.loaded = "1";
        }
        children.classList.add("open");
        toggle.textContent = "▾";
        expanded = true;
      } else {
        children.classList.remove("open");
        toggle.textContent = "▸";
        expanded = false;
      }
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      expand();
    });

    row.addEventListener("click", (e) => {
      setTreeNodeSelected(row, dir.path, "dir", e.metaKey || e.ctrlKey);
    });

    row.addEventListener("dblclick", (e) => {
      e.preventDefault();
      expand();
    });

    wrap.append(row, children);
    return wrap;
  }

  function createFileNode(file, depth) {
    const row = document.createElement("div");
    row.className = "tree-node";
    row.style.paddingLeft = makeIndent(depth);
    row.setAttribute("role", "treeitem");
    row.dataset.path = file.path;
    row.dataset.kind = "file";

    const toggle = document.createElement("span");
    toggle.className = "tree-toggle empty";
    toggle.textContent = "·";

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = "🎵";

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = file.name;

    row.append(toggle, icon, label);

    row.addEventListener("click", (e) => {
      setTreeNodeSelected(row, file.path, "file", e.metaKey || e.ctrlKey);
    });

    row.addEventListener("dblclick", async (e) => {
      e.preventDefault();
      const startPlay = playlist.length === 0 || audio.paused;
      await addPathsToPlaylist([file.path]);
      if (startPlay) {
        playIndex(playlist.length - 1);
      }
    });

    return row;
  }

  async function initTree() {
    treeEl.innerHTML = "";
    await loadChildren(treeEl, "", 0);
  }

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

  async function addPathsToPlaylist(paths) {
    if (!paths.length) return;
    for (const path of paths) {
      if (playlist.some((t) => t.path === path)) {
        // Allow duplicates? Foobar allows them — allow.
      }
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
    savePlaylist();
  }

  function renderPlaylist() {
    plBody.innerHTML = "";
    if (!playlist.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "playlist-empty";
      td.textContent = "Playlist empty — double-click tracks or use Add selected / Add folder";
      tr.appendChild(td);
      plBody.appendChild(tr);
      return;
    }

    playlist.forEach((track, index) => {
      const tr = document.createElement("tr");
      tr.dataset.index = String(index);
      tr.draggable = true;
      if (plSelected.has(index)) tr.classList.add("selected");
      if (index === currentIndex) tr.classList.add("playing");

      tr.innerHTML = `
        <td class="col-num">${index + 1}</td>
        <td class="col-title"></td>
        <td class="col-artist"></td>
        <td class="col-album"></td>
        <td class="col-dur"></td>
      `;
      tr.children[1].textContent = track.title;
      tr.children[2].textContent = track.artist;
      tr.children[3].textContent = track.album;
      tr.children[4].textContent = formatTime(track.duration);

      tr.addEventListener("click", (e) => {
        if (e.shiftKey && plLastClicked >= 0) {
          const a = Math.min(plLastClicked, index);
          const b = Math.max(plLastClicked, index);
          if (!(e.metaKey || e.ctrlKey)) plSelected.clear();
          for (let i = a; i <= b; i++) plSelected.add(i);
        } else if (e.metaKey || e.ctrlKey) {
          if (plSelected.has(index)) plSelected.delete(index);
          else plSelected.add(index);
          plLastClicked = index;
        } else {
          plSelected.clear();
          plSelected.add(index);
          plLastClicked = index;
        }
        renderPlaylist();
      });

      tr.addEventListener("dblclick", () => {
        playIndex(index);
      });

      // Drag reorder
      tr.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
        tr.classList.add("dragging");
      });
      tr.addEventListener("dragend", () => tr.classList.remove("dragging"));
      tr.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      tr.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData("text/plain"));
        const to = index;
        if (!Number.isFinite(from) || from === to) return;
        reorderPlaylist(from, to);
      });

      plBody.appendChild(tr);
    });
  }

  function reorderPlaylist(from, to) {
    const [item] = playlist.splice(from, 1);
    playlist.splice(to, 0, item);
    if (currentIndex === from) currentIndex = to;
    else if (from < currentIndex && to >= currentIndex) currentIndex -= 1;
    else if (from > currentIndex && to <= currentIndex) currentIndex += 1;
    plSelected.clear();
    plSelected.add(to);
    rebuildShuffleOrder(true);
    renderPlaylist();
    savePlaylist();
  }

  function removeSelectedFromPlaylist() {
    if (!plSelected.size) return;
    const indices = [...plSelected].sort((a, b) => b - a);
    const removingCurrent = plSelected.has(currentIndex);
    for (const i of indices) {
      playlist.splice(i, 1);
      if (i < currentIndex) currentIndex -= 1;
      else if (i === currentIndex) currentIndex = -1;
    }
    plSelected.clear();
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
    plSelected.clear();
    shuffleOrder = [];
    shufflePos = -1;
    renderPlaylist();
    savePlaylist();
    stopPlayback();
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
    btnPlay.textContent = audio.paused ? "▶" : "⏸";
    btnShuffle.setAttribute("aria-pressed", shuffle ? "true" : "false");
    btnRepeat.dataset.mode = repeat;
    btnRepeat.setAttribute("aria-pressed", repeat !== "off" ? "true" : "false");
    if (repeat === "off") btnRepeat.textContent = "Repeat";
    else if (repeat === "one") btnRepeat.textContent = "Repeat 1";
    else btnRepeat.textContent = "Repeat All";
  }

  function updateNowPlaying() {
    if (currentIndex < 0 || !playlist[currentIndex]) {
      npTitle.textContent = "—";
      npArtist.textContent = "No track";
      coverArt.src = PLACEHOLDER_COVER;
      libraryCoverArt.src = PLACEHOLDER_COVER;
      return;
    }
    const t = playlist[currentIndex];
    npTitle.textContent = t.title;
    npArtist.textContent = [t.artist, t.album].filter(Boolean).join(" — ") || "Unknown";
    // Player bar: fixed thumbnail (200×200 JPEG from server)
    coverArt.src = coverUrl(t.path, "thumb");
    // Library panel: full extracted art (no server-side downscale)
    libraryCoverArt.src = coverUrl(t.path, "full");
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
      console.error("Playback failed", err);
      npArtist.textContent = "Playback failed (see console)";
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
  });
  audio.addEventListener("loadedmetadata", () => {
    timeTotal.textContent = formatTime(audio.duration);
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
      const raw = sessionStorage.getItem(CODEC_STORAGE_KEY);
      if (raw == null) {
        // One-time map from legacy sample-rate preference
        const legacy = sessionStorage.getItem("musicweb.sampleRate");
        if (legacy === "48000") streamCodec = "opus_192_48000";
        else if (legacy === "44100") streamCodec = "aac_256_44100";
        return;
      }
      if (ALLOWED_CODECS.has(raw)) streamCodec = raw;
    } catch {
      /* ignore */
    }
  }

  function saveStreamCodec() {
    try {
      sessionStorage.setItem(CODEC_STORAGE_KEY, streamCodec);
    } catch {
      /* ignore quota */
    }
  }

  streamCodecEl.addEventListener("change", () => {
    const v = streamCodecEl.value;
    if (!ALLOWED_CODECS.has(v)) return;
    if (v === streamCodec) return;
    streamCodec = v;
    saveStreamCodec();
    // Reload current track so the user gets the new codec stream.
    if (currentIndex >= 0 && currentIndex < playlist.length) {
      playIndex(currentIndex);
    }
  });

  // ── Toolbar buttons ────────────────────────────────────────────────
  $("btn-play").addEventListener("click", togglePlay);
  $("btn-next").addEventListener("click", playNext);
  $("btn-prev").addEventListener("click", playPrev);

  $("btn-shuffle").addEventListener("click", () => {
    shuffle = !shuffle;
    if (shuffle) rebuildShuffleOrder(true);
    updateTransportUI();
    savePlaylist();
  });

  $("btn-repeat").addEventListener("click", () => {
    if (repeat === "off") repeat = "all";
    else if (repeat === "all") repeat = "one";
    else repeat = "off";
    updateTransportUI();
    savePlaylist();
  });

  $("btn-add-selected").addEventListener("click", async () => {
    if (!treeSelected.size) return;
    const files = [];
    for (const [p, kind] of treeSelected) {
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
    await addPathsToPlaylist(files);
  });

  $("btn-add-folder").addEventListener("click", async () => {
    if (!treeSelected.size) return;
    const files = [];
    for (const [p] of treeSelected) {
      try {
        const data = await apiGet(`/api/collect?path=${encodePath(p)}`);
        files.push(...data.files);
      } catch (err) {
        console.error(err);
      }
    }
    await addPathsToPlaylist(files);
  });

  $("btn-remove").addEventListener("click", removeSelectedFromPlaylist);
  $("btn-clear").addEventListener("click", clearPlaylist);

  // ── Resizable splitters ────────────────────────────────────────────
  const splitter = $("splitter");
  const libraryPane = document.querySelector(".library-pane");
  let dragging = false;

  splitter.addEventListener("pointerdown", (e) => {
    dragging = true;
    splitter.setPointerCapture(e.pointerId);
  });
  splitter.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const main = document.querySelector(".main-panes");
    const rect = main.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.min(60, Math.max(15, (x / rect.width) * 100));
    libraryPane.style.width = `${pct}%`;
  });
  splitter.addEventListener("pointerup", () => {
    dragging = false;
  });

  // Vertical splitter: resize full cover panel under the file tree
  const COVER_HEIGHT_KEY = "musicweb.coverPanelHeight";
  const vSplitter = $("library-v-splitter");
  let vDragging = false;

  try {
    const saved = localStorage.getItem(COVER_HEIGHT_KEY);
    if (saved) {
      const h = Number(saved);
      if (Number.isFinite(h) && h >= 80) {
        libraryCoverPanel.style.height = `${h}px`;
      }
    }
  } catch {
    /* ignore */
  }

  vSplitter.addEventListener("pointerdown", (e) => {
    vDragging = true;
    vSplitter.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  vSplitter.addEventListener("pointermove", (e) => {
    if (!vDragging) return;
    const paneRect = libraryPane.getBoundingClientRect();
    // Cover panel sits at the bottom; height = distance from pointer to pane bottom
    // minus half the splitter (pointer is on the splitter above the panel)
    const fromBottom = paneRect.bottom - e.clientY;
    const maxH = Math.max(80, paneRect.height - 120); // leave room for header + tree
    const h = Math.min(maxH, Math.max(80, fromBottom));
    libraryCoverPanel.style.height = `${h}px`;
  });
  vSplitter.addEventListener("pointerup", () => {
    if (!vDragging) return;
    vDragging = false;
    try {
      localStorage.setItem(
        COVER_HEIGHT_KEY,
        String(libraryCoverPanel.getBoundingClientRect().height)
      );
    } catch {
      /* ignore quota */
    }
  });

  // ── Boot ───────────────────────────────────────────────────────────
  loadStreamCodec();
  streamCodecEl.value = streamCodec;
  loadPlaylist();
  renderPlaylist();
  updateTransportUI();
  updateNowPlaying();
  audio.volume = Number(volume.value);
  initTree().catch(console.error);
})();
