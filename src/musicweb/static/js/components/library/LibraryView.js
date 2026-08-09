import {
  computed,
  defineComponent,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { apiGet, apiPost, artistImageUrl, coverUrl } from "../../api.js";
import { formatTrackLabel } from "../../util.js";
import { addToQueue } from "../../stores/playlist.js";
import { audio, playIndex } from "../../stores/player.js";
import {
  clearLibSelection,
  toggleLibSelection,
  ui,
} from "../../stores/ui.js";
import { openSettings } from "../../stores/settings.js";
import Icon from "../icons/Icon.js";
import ModeBar from "../layout/ModeBar.js";
import { playOrQueueTrack, queueOnly } from "./rows.js";

export default defineComponent({
  name: "LibraryView",
  components: { Icon, ModeBar },
  setup() {
    const route = useRoute();
    const router = useRouter();

    const loading = ref(false);
    const error = ref("");
    const emptyMsg = ref("");
    const title = ref("Folders");
    const showBack = ref(false);
    const dirs = ref([]);
    const files = ref([]);
    const artists = ref([]);
    const albums = ref([]);
    const tracks = ref([]);
    const searchSections = ref(null);
    const albumGrid = ref(false);
    const searchQuery = ref(route.query.q ? String(route.query.q) : "");
    let searchTimer = null;
    let renderSeq = 0;

    /** Effective library location — stays put when the URL is /queue. */
    const libLoc = computed(() => {
      if (route.meta.pane === "queue") return ui.lastLibrary;
      return {
        name: route.name,
        params: route.params,
        query: route.query,
        meta: route.meta,
      };
    });

    const mode = computed(() => libLoc.value.meta?.mode || "folders");
    const isSearch = computed(() => mode.value === "search");
    const folderPath = computed(() => {
      const q = libLoc.value.query || {};
      return mode.value === "folders" && q.path ? String(q.path) : "";
    });
    const routeName = computed(() => libLoc.value.name);
    const artistId = computed(() => libLoc.value.params?.artistId);
    const albumId = computed(() => libLoc.value.params?.albumId);
    const selectedCount = computed(() => ui.libSelected.size);
    const showAddAll = computed(() => {
      if (mode.value === "search" && !artistId.value && !albumId.value)
        return false;
      if (mode.value === "folders") return true;
      return Boolean(artistId.value || albumId.value);
    });
    const showAddSelected = computed(
      () => mode.value === "folders" && selectedCount.value > 0
    );

    function isCurrent(seq) {
      return seq === renderSeq;
    }

    function resetLists() {
      dirs.value = [];
      files.value = [];
      artists.value = [];
      albums.value = [];
      tracks.value = [];
      searchSections.value = null;
      albumGrid.value = false;
      error.value = "";
      emptyMsg.value = "";
    }

    async function load() {
      const seq = ++renderSeq;
      clearLibSelection();
      resetLists();
      loading.value = true;

      try {
        if (mode.value === "folders") {
          showBack.value = Boolean(folderPath.value);
          title.value = folderPath.value
            ? folderPath.value.split("/").filter(Boolean).pop() || "Folders"
            : "Folders";
          const data = await apiGet(
            `/api/browse?path=${encodeURIComponent(folderPath.value)}`
          );
          if (!isCurrent(seq)) return;
          dirs.value = data.dirs || [];
          files.value = data.files || [];
          if (!dirs.value.length && !files.value.length) {
            emptyMsg.value = "This folder is empty";
          }
          const ids = files.value.map((f) => f.id).filter(Boolean);
          if (ids.length) {
            try {
              const meta = await apiPost("/api/tracks/meta", { ids });
              if (!isCurrent(seq)) return;
              const byId = new Map(
                (meta.results || []).map((m) => [m.id, m])
              );
              files.value = files.value.map((f) => {
                const m = f.id ? byId.get(f.id) : null;
                if (!m) return f;
                return {
                  ...f,
                  meta: m,
                  displayName: formatTrackLabel(m),
                  cover: coverUrl(m, "thumb", false),
                };
              });
            } catch (err) {
              console.error(err);
            }
          }
        } else if (mode.value === "search") {
          showBack.value = false;
          title.value = "Search";
          const q =
            (searchQuery.value || "").trim() ||
            String(libLoc.value.query?.q || "").trim();
          if (!q) {
            emptyMsg.value = "Type to search the library index";
            return;
          }
          const data = await apiGet(
            `/api/search?q=${encodeURIComponent(q)}&limit=50`
          );
          if (!isCurrent(seq)) return;
          const a = data.artists || [];
          const al = data.albums || [];
          const t = data.tracks || [];
          if (!a.length && !al.length && !t.length) {
            emptyMsg.value = `No results for “${q}”`;
          } else {
            searchSections.value = { artists: a, albums: al, tracks: t };
          }
        } else if (routeName.value === "artist") {
          showBack.value = true;
          const id = artistId.value;
          try {
            const artist = await apiGet(
              `/api/artists/${encodeURIComponent(id)}`
            );
            if (!isCurrent(seq)) return;
            title.value = artist.name || "Artist";
          } catch {
            title.value = "Artist";
          }
          const data = await apiGet(
            `/api/artists/${encodeURIComponent(id)}/albums`
          );
          if (!isCurrent(seq)) return;
          albums.value = data.items || [];
          albumGrid.value = true;
          if (!albums.value.length) emptyMsg.value = "No albums for this artist";
        } else if (routeName.value === "album") {
          showBack.value = true;
          const id = albumId.value;
          try {
            const album = await apiGet(
              `/api/albums/${encodeURIComponent(id)}`
            );
            if (!isCurrent(seq)) return;
            title.value = album.title || "Album";
          } catch {
            title.value = "Album";
          }
          const data = await apiGet(
            `/api/albums/${encodeURIComponent(id)}/tracks`
          );
          if (!isCurrent(seq)) return;
          tracks.value = data.items || [];
          if (!tracks.value.length) emptyMsg.value = "No tracks";
        } else if (mode.value === "artists") {
          showBack.value = false;
          title.value = "Artists";
          const data = await apiGet("/api/artists?limit=500");
          if (!isCurrent(seq)) return;
          artists.value = data.items || [];
          if (!artists.value.length) {
            emptyMsg.value =
              "No artists yet — wait for library scan or re-scan in Settings";
          }
        } else if (mode.value === "albums") {
          showBack.value = false;
          title.value = "Albums";
          const data = await apiGet("/api/albums?limit=500&sort=title");
          if (!isCurrent(seq)) return;
          albums.value = data.items || [];
          albumGrid.value = true;
          if (!albums.value.length) {
            emptyMsg.value =
              "No albums yet — wait for library scan or re-scan in Settings";
          }
        }
      } catch (err) {
        if (!isCurrent(seq)) return;
        error.value = err.message || String(err);
      } finally {
        if (isCurrent(seq)) loading.value = false;
      }
    }

    function goBack() {
      if (mode.value === "folders" && folderPath.value) {
        const parts = folderPath.value.split("/").filter(Boolean);
        parts.pop();
        const parent = parts.join("/");
        router.push({
          name: "folders",
          query: parent ? { path: parent } : {},
        });
        return;
      }
      // Artists/albums drill-down and search → entity: prefer history.
      if (window.history.length > 1) {
        router.back();
        return;
      }
      router.push({ name: mode.value === "artists" ? "artists" : "albums" });
    }

    function openFolder(dir) {
      router.push({ name: "folders", query: { path: dir.path } });
    }

    function openArtist(artist) {
      router.push({ name: "artist", params: { artistId: artist.id } });
    }

    function openAlbum(album) {
      router.push({ name: "album", params: { albumId: album.id } });
    }

    function onRowClick(path, kind, e) {
      if (e.metaKey || e.ctrlKey) {
        toggleLibSelection(path, kind);
        return true;
      }
      return false;
    }

    function isSelected(path) {
      return ui.libSelected.has(path);
    }

    async function onFileClick(file, e) {
      if (onRowClick(file.path, "file", e)) return;
      if (!file.id) return;
      await playOrQueueTrack({ id: file.id, ...(file.meta || {}) });
    }

    async function onFileAdd(file, e) {
      e.stopPropagation();
      if (!file.id) return;
      await queueOnly({ id: file.id, ...(file.meta || {}) });
    }

    async function addAll() {
      try {
        if (mode.value === "folders") {
          const data = await apiGet(
            `/api/collect?path=${encodeURIComponent(folderPath.value)}`
          );
          await addToQueue((data.files || []).filter((f) => f.id));
          return;
        }
        if (routeName.value === "album") {
          const data = await apiGet(
            `/api/albums/${encodeURIComponent(albumId.value)}/tracks`
          );
          await addToQueue(data.items || []);
        } else if (routeName.value === "artist") {
          const data = await apiGet(
            `/api/artists/${encodeURIComponent(artistId.value)}/albums`
          );
          const all = [];
          for (const album of data.items || []) {
            const tr = await apiGet(
              `/api/albums/${encodeURIComponent(album.id)}/tracks`
            );
            all.push(...(tr.items || []));
          }
          await addToQueue(all);
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function addSelected() {
      if (!ui.libSelected.size) return;
      const filesOut = (
        await Promise.all(
          [...ui.libSelected].map(async ([p]) => {
            try {
              const data = await apiGet(
                `/api/collect?path=${encodeURIComponent(p)}`
              );
              return (data.files || []).filter((f) => f.id);
            } catch (err) {
              console.error(err);
              return [];
            }
          })
        )
      ).flat();
      clearLibSelection();
      await addToQueue(filesOut);
    }

    function onSearchInput() {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const q = searchQuery.value.trim();
        router.replace({
          name: "search",
          query: q ? { q } : {},
        });
      }, 250);
    }

    function onSearchEnter() {
      if (searchTimer) clearTimeout(searchTimer);
      const q = searchQuery.value.trim();
      router.replace({ name: "search", query: q ? { q } : {} });
    }

    function fileCover(file) {
      return (
        file.cover ||
        (file.id
          ? coverUrl({ id: file.id }, "thumb", false)
          : "/static/img/placeholder.svg")
      );
    }

    function albumCover(album) {
      return coverUrl({ albumId: album.id }, "thumb", false);
    }

    function artistCover(artist) {
      return artistImageUrl(artist, "thumb", false);
    }

    function trackCover(track) {
      return coverUrl(track, "thumb", false);
    }

    watch(
      () => [route.fullPath, route.query.q, ui.lastLibrary],
      () => {
        if (route.meta.pane === "library") {
          if (mode.value === "search") {
            searchQuery.value = route.query.q ? String(route.query.q) : "";
          }
          load();
          return;
        }
        // /queue: only load once if library pane is still empty
        if (!dirs.value.length && !files.value.length && !artists.value.length
          && !albums.value.length && !tracks.value.length && !searchSections.value
          && !emptyMsg.value && !error.value) {
          load();
        }
      }
    );

    onMounted(load);

    return {
      mode,
      isSearch,
      title,
      showBack,
      loading,
      error,
      emptyMsg,
      dirs,
      files,
      artists,
      albums,
      tracks,
      searchSections,
      albumGrid,
      searchQuery,
      showAddAll,
      showAddSelected,
      goBack,
      openFolder,
      openArtist,
      openAlbum,
      onRowClick,
      isSelected,
      onFileClick,
      onFileAdd,
      addAll,
      addSelected,
      onSearchInput,
      onSearchEnter,
      openSettings,
      fileCover,
      albumCover,
      artistCover,
      trackCover,
      playOrQueueTrack,
      queueOnly,
      formatTrackLabel,
    };
  },
  template: `
    <section id="view-library" class="view" aria-label="Library">
      <div class="view-bar">
        <button
          v-if="showBack"
          type="button"
          class="icon-btn"
          title="Back"
          aria-label="Back"
          @click="goBack"
        >
          <Icon name="chevron-left" />
        </button>
        <div class="view-title">{{ title }}</div>
        <div class="view-actions">
          <button
            v-if="showAddSelected"
            type="button"
            class="pill"
            @click="addSelected"
          >Add selected</button>
          <button
            v-if="showAddAll"
            type="button"
            class="pill"
            @click="addAll"
          >Add all</button>
          <button
            type="button"
            class="icon-btn"
            title="Settings"
            aria-label="Settings"
            aria-haspopup="dialog"
            @click="openSettings"
          >
            <Icon name="settings" />
          </button>
        </div>
      </div>

      <ModeBar />

      <div v-if="isSearch" class="search-bar">
        <input
          type="search"
          class="search-input"
          v-model="searchQuery"
          placeholder="Search artists, albums, tracks…"
          autocomplete="off"
          enterkeyhint="search"
          @input="onSearchInput"
          @keydown.enter.prevent="onSearchEnter"
        />
      </div>

      <div class="row-list" :class="{ 'album-grid-host': albumGrid }">
        <div v-if="error" class="list-empty">Error: {{ error }}</div>
        <div v-else-if="emptyMsg" class="list-empty">{{ emptyMsg }}</div>

        <template v-else-if="mode === 'folders'">
          <div
            v-for="dir in dirs"
            :key="'d-' + dir.path"
            class="row"
            :class="{ selected: isSelected(dir.path) }"
            @click="(e) => { if (!onRowClick(dir.path, 'dir', e)) openFolder(dir); }"
          >
            <span class="row-icon"><Icon name="folder" /></span>
            <span class="row-meta"><span class="row-title">{{ dir.name }}</span></span>
            <span class="row-chevron"><Icon name="chevron-right" /></span>
          </div>
          <div
            v-for="file in files"
            :key="'f-' + file.path"
            class="row"
            :class="{ selected: isSelected(file.path) }"
            @click="(e) => onFileClick(file, e)"
          >
            <span class="row-cover-wrap">
              <img class="row-cover" :src="fileCover(file)" alt="" loading="lazy" />
            </span>
            <span class="row-meta">
              <span class="row-title">{{ file.displayName || file.name }}</span>
            </span>
            <button
              type="button"
              class="icon-btn row-add"
              title="Add to playlist"
              aria-label="Add to playlist"
              @click="(e) => onFileAdd(file, e)"
            ><Icon name="plus" /></button>
          </div>
        </template>

        <template v-else-if="artists.length">
          <div
            v-for="artist in artists"
            :key="artist.id"
            class="row"
            @click="openArtist(artist)"
          >
            <span class="row-cover-wrap">
              <img class="row-cover" :src="artistCover(artist)" alt="" loading="lazy" />
            </span>
            <span class="row-meta">
              <span class="row-title">{{ artist.name }}</span>
              <span class="row-sub">{{ artist.album_count }} album{{ artist.album_count === 1 ? '' : 's' }} · {{ artist.track_count }} tracks</span>
            </span>
            <span class="row-chevron"><Icon name="chevron-right" /></span>
          </div>
        </template>

        <template v-else-if="albumGrid && albums.length">
          <div class="album-grid">
            <button
              v-for="album in albums"
              :key="album.id"
              type="button"
              class="album-card"
              @click="openAlbum(album)"
            >
              <img class="album-card-cover" :src="albumCover(album)" alt="" loading="lazy" />
              <span class="album-card-title">{{ album.title }}</span>
              <span class="album-card-sub">{{ [album.artist, album.year].filter(Boolean).join(' · ') }}</span>
            </button>
          </div>
        </template>

        <template v-else-if="tracks.length">
          <div
            v-for="track in tracks"
            :key="track.id"
            class="row"
            @click="(e) => { if (!e.target.closest('.row-add')) playOrQueueTrack(track); }"
          >
            <span class="row-cover-wrap">
              <img class="row-cover" :src="trackCover(track)" alt="" loading="lazy" />
            </span>
            <span class="row-meta">
              <span class="row-title">{{ formatTrackLabel(track) }}</span>
              <span class="row-sub">{{ track.artist || '' }}</span>
            </span>
            <button
              type="button"
              class="icon-btn row-add"
              title="Add to playlist"
              aria-label="Add to playlist"
              @click.stop="queueOnly(track)"
            ><Icon name="plus" /></button>
          </div>
        </template>

        <template v-else-if="searchSections">
          <template v-if="searchSections.artists.length">
            <div class="section-label">Artists</div>
            <div
              v-for="artist in searchSections.artists"
              :key="'sa-' + artist.id"
              class="row"
              @click="openArtist(artist)"
            >
              <span class="row-cover-wrap">
                <img class="row-cover" :src="artistCover(artist)" alt="" loading="lazy" />
              </span>
              <span class="row-meta"><span class="row-title">{{ artist.name }}</span></span>
              <span class="row-chevron"><Icon name="chevron-right" /></span>
            </div>
          </template>
          <template v-if="searchSections.albums.length">
            <div class="section-label">Albums</div>
            <div
              v-for="album in searchSections.albums"
              :key="'sal-' + album.id"
              class="row"
              @click="openAlbum(album)"
            >
              <span class="row-cover-wrap">
                <img class="row-cover" :src="albumCover(album)" alt="" loading="lazy" />
              </span>
              <span class="row-meta">
                <span class="row-title">{{ album.title }}</span>
                <span class="row-sub">{{ album.artist || '' }}{{ album.year ? ' · ' + album.year : '' }} · {{ album.track_count }} tracks</span>
              </span>
              <span class="row-chevron"><Icon name="chevron-right" /></span>
            </div>
          </template>
          <template v-if="searchSections.tracks.length">
            <div class="section-label">Tracks</div>
            <div
              v-for="track in searchSections.tracks"
              :key="'st-' + track.id"
              class="row"
              @click="(e) => { if (!e.target.closest('.row-add')) playOrQueueTrack(track); }"
            >
              <span class="row-cover-wrap">
                <img class="row-cover" :src="trackCover(track)" alt="" loading="lazy" />
              </span>
              <span class="row-meta">
                <span class="row-title">{{ track.title }}</span>
                <span class="row-sub">{{ [track.artist, track.album].filter(Boolean).join(' — ') }}</span>
              </span>
              <button
                type="button"
                class="icon-btn row-add"
                title="Add to playlist"
                aria-label="Add to playlist"
                @click.stop="queueOnly(track)"
              ><Icon name="plus" /></button>
            </div>
          </template>
        </template>
      </div>
    </section>
  `,
});
