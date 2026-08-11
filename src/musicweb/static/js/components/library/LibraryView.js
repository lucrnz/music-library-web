/**
 * Library pane shell: chrome, ModeBar, search, body host.
 * Page data comes from loaders (discriminated body); actions from libraryActions.
 */
import {
  computed,
  defineComponent,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import {
  clearLibSelection,
  toggleLibSelection,
  toggleLibraryLayout,
  ui,
} from "../../stores/ui.js";
import { openSettings } from "../../stores/settings.js";
import {
  connectivityBanner,
  connectivityLoadError,
} from "../../connectivity.js";
import {
  noteServerReachable,
  noteServerUnreachable,
  refreshDownloadStatuses,
} from "../../downloads/index.js";
import { downloads } from "../../downloads/state.js";
import Icon from "../icons/Icon.js";
import ModeBar from "../layout/ModeBar.js";
import {
  addAll as addAllAction,
  addSelected as addSelectedAction,
  downloadCurrentAlbum as downloadAlbumAction,
} from "./libraryActions.js";
import { loadLibraryPage } from "./loaders.js";
import { useLibraryLocation } from "./useLibraryLocation.js";
import AlbumCard from "./rows/AlbumCard.js";
import AlbumListRow from "./rows/AlbumListRow.js";
import ArtistCard from "./rows/ArtistCard.js";
import ArtistRow from "./rows/ArtistRow.js";
import FileCard from "./rows/FileCard.js";
import FileRow from "./rows/FileRow.js";
import FolderCard from "./rows/FolderCard.js";
import FolderRow from "./rows/FolderRow.js";
import TrackRow from "./rows/TrackRow.js";

/** @type {import("./loaders.js").LibraryBody} */
const INITIAL_BODY = { kind: "empty", message: "" };

export default defineComponent({
  name: "LibraryView",
  components: {
    Icon,
    ModeBar,
    AlbumCard,
    AlbumListRow,
    ArtistCard,
    ArtistRow,
    FileCard,
    FileRow,
    FolderCard,
    FolderRow,
    TrackRow,
  },
  setup() {
    const router = useRouter();
    const {
      route,
      libLoc,
      mode,
      isSearch,
      folderPath,
      routeName,
      artistId,
      albumId,
    } = useLibraryLocation();

    const loading = ref(false);
    const error = ref("");
    const title = ref("Folders");
    const showBack = ref(false);
    /** Parent artist id for album-detail Back (hierarchical, not history). */
    const backArtistId = ref(/** @type {string|null} */ (null));
    /** @type {import("vue").Ref<import("./loaders.js").LibraryBody>} */
    const body = ref(INITIAL_BODY);
    const searchQuery = ref(route.query.q ? String(route.query.q) : "");
    /** True after at least one successful load for the library pane. */
    const hasLoadedOnce = ref(false);
    let searchTimer = null;
    let renderSeq = 0;

    const selectedCount = computed(() => ui.libSelected.size);
    const showAddAll = computed(() => {
      if (mode.value === "search" && !artistId.value && !albumId.value) {
        return false;
      }
      if (mode.value === "folders") return true;
      return Boolean(artistId.value || albumId.value);
    });
    const showAddSelected = computed(
      () => mode.value === "folders" && selectedCount.value > 0
    );
    const showDownloadAlbum = computed(
      () =>
        downloads.enabled &&
        Boolean(albumId.value) &&
        body.value.kind === "tracks" &&
        body.value.tracks.length > 0
    );

    /** Layout toggle: folders / artists / albums browse — not search or track lists. */
    const showLayoutToggle = computed(() => {
      if (isSearch.value || mode.value === "search") return false;
      // Album detail is always a track list.
      if (albumId.value || body.value.kind === "tracks") return false;
      if (body.value.kind === "search") return false;
      return (
        mode.value === "folders" ||
        mode.value === "artists" ||
        mode.value === "albums"
      );
    });
    const isGrid = computed(
      () => showLayoutToggle.value && ui.libraryLayout === "grid"
    );
    const gridHost = computed(() => {
      if (!isGrid.value) return false;
      const k = body.value.kind;
      return k === "folders" || k === "artists" || k === "albumGrid";
    });
    const layoutToggleIcon = computed(() =>
      ui.libraryLayout === "grid" ? "layout-list" : "layout-grid"
    );
    const layoutToggleLabel = computed(() =>
      ui.libraryLayout === "grid" ? "Switch to list view" : "Switch to grid view"
    );

    function isCurrent(seq) {
      return seq === renderSeq;
    }

    /** @param {import("./loaders.js").LibraryPage} page */
    function applyPage(page) {
      title.value = page.chrome.title;
      showBack.value = page.chrome.showBack;
      backArtistId.value = page.chrome.backArtistId
        ? String(page.chrome.backArtistId)
        : null;
      body.value = page.body;
    }

    async function load() {
      const seq = ++renderSeq;
      clearLibSelection();
      error.value = "";
      loading.value = true;

      try {
        const q =
          (searchQuery.value || "").trim() ||
          String(libLoc.value.query?.q || "").trim();
        const page = await loadLibraryPage({
          mode: mode.value,
          routeName: routeName.value,
          folderPath: folderPath.value,
          artistId: artistId.value,
          albumId: albumId.value,
          searchQuery: q,
        });
        if (!isCurrent(seq)) return;
        applyPage(page);
        hasLoadedOnce.value = true;
      } catch (err) {
        if (!isCurrent(seq)) return;
        const msg = err.message || String(err);
        noteServerUnreachable(err);
        error.value =
          connectivityLoadError(downloads.connectivity, downloads.enabled) ||
          msg;
        body.value = INITIAL_BODY;
      } finally {
        if (isCurrent(seq)) loading.value = false;
      }
      if (!error.value) {
        noteServerReachable();
      }
      if (downloads.enabled && isCurrent(seq)) {
        refreshDownloadStatuses().catch(() => {});
      }
    }

    /** Hierarchical parent only — never history.back() (can unload the page). */
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
      if (routeName.value === "album") {
        // Prefer the album's artist when known (set while loading album chrome).
        const aid = backArtistId.value;
        if (aid) {
          router.push({ name: "artist", params: { artistId: aid } });
          return;
        }
        router.push({ name: "albums" });
        return;
      }
      if (routeName.value === "artist") {
        router.push({ name: "artists" });
        return;
      }
      router.push({
        name: mode.value === "artists" ? "artists" : "albums",
      });
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

    function isSelected(path) {
      return ui.libSelected.has(path);
    }

    function onFolderSelect(dir) {
      toggleLibSelection(dir.path, "dir");
    }

    function onFileSelect(file) {
      toggleLibSelection(file.path, "file");
    }

    async function addAll() {
      await addAllAction({
        mode: mode.value,
        routeName: routeName.value,
        folderPath: folderPath.value,
        artistId: artistId.value,
        albumId: albumId.value,
      });
    }

    async function addSelected() {
      await addSelectedAction();
    }

    async function downloadCurrentAlbum() {
      if (body.value.kind !== "tracks") return;
      await downloadAlbumAction(body.value.tracks);
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
        // /queue: load library pane once if never loaded.
        if (!hasLoadedOnce.value) {
          load();
        }
      }
    );

    onMounted(load);

    const offlineBanner = computed(() =>
      connectivityBanner(downloads.connectivity, downloads.enabled)
    );

    return {
      isSearch,
      title,
      showBack,
      loading,
      error,
      body,
      searchQuery,
      showAddAll,
      showAddSelected,
      showDownloadAlbum,
      showLayoutToggle,
      isGrid,
      gridHost,
      layoutToggleIcon,
      layoutToggleLabel,
      toggleLibraryLayout,
      goBack,
      openFolder,
      openArtist,
      openAlbum,
      isSelected,
      onFolderSelect,
      onFileSelect,
      addAll,
      addSelected,
      downloadCurrentAlbum,
      onSearchInput,
      onSearchEnter,
      openSettings,
      downloads,
      offlineBanner,
    };
  },
  template: `
    <section id="view-library" class="view" aria-label="Library">
      <div
        v-if="offlineBanner"
        class="offline-banner"
        role="status"
      >{{ offlineBanner }}</div>
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
            v-if="showDownloadAlbum"
            type="button"
            class="pill"
            title="Download album"
            @click="downloadCurrentAlbum"
          ><Icon name="download" /><span>Download</span></button>
          <button
            v-if="showLayoutToggle"
            type="button"
            class="icon-btn"
            :title="layoutToggleLabel"
            :aria-label="layoutToggleLabel"
            @click="toggleLibraryLayout"
          >
            <Icon :name="layoutToggleIcon" />
          </button>
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

      <div class="row-list" :class="{ 'album-grid-host': gridHost }">
        <div v-if="error" class="list-empty">Error: {{ error }}</div>
        <div v-else-if="body.kind === 'empty'" class="list-empty">{{ body.message }}</div>

        <template v-else-if="body.kind === 'folders'">
          <div v-if="isGrid" class="album-grid">
            <FolderCard
              v-for="dir in body.dirs"
              :key="'d-' + dir.path"
              :dir="dir"
              :selected="isSelected(dir.path)"
              @open="openFolder"
              @select="onFolderSelect"
            />
            <FileCard
              v-for="file in body.files"
              :key="'f-' + file.path"
              :file="file"
              :selected="isSelected(file.path)"
              @select="onFileSelect"
            />
          </div>
          <template v-else>
            <FolderRow
              v-for="dir in body.dirs"
              :key="'d-' + dir.path"
              :dir="dir"
              :selected="isSelected(dir.path)"
              @open="openFolder"
              @select="onFolderSelect"
            />
            <FileRow
              v-for="file in body.files"
              :key="'f-' + file.path"
              :file="file"
              :selected="isSelected(file.path)"
              @select="onFileSelect"
            />
          </template>
        </template>

        <template v-else-if="body.kind === 'artists'">
          <div v-if="isGrid" class="album-grid">
            <ArtistCard
              v-for="artist in body.artists"
              :key="artist.id"
              :artist="artist"
              @open="openArtist"
            />
          </div>
          <template v-else>
            <ArtistRow
              v-for="artist in body.artists"
              :key="artist.id"
              :artist="artist"
              @open="openArtist"
            />
          </template>
        </template>

        <template v-else-if="body.kind === 'albumGrid'">
          <div v-if="isGrid" class="album-grid">
            <AlbumCard
              v-for="album in body.albums"
              :key="album.id"
              :album="album"
              @open="openAlbum"
            />
          </div>
          <template v-else>
            <AlbumListRow
              v-for="album in body.albums"
              :key="album.id"
              :album="album"
              @open="openAlbum"
            />
          </template>
        </template>

        <template v-else-if="body.kind === 'tracks'">
          <TrackRow
            v-for="track in body.tracks"
            :key="track.id"
            :track="track"
          />
        </template>

        <template v-else-if="body.kind === 'search'">
          <template v-if="body.sections.artists.length">
            <div class="section-label">Artists</div>
            <ArtistRow
              v-for="artist in body.sections.artists"
              :key="'sa-' + artist.id"
              :artist="artist"
              :show-counts="false"
              @open="openArtist"
            />
          </template>
          <template v-if="body.sections.albums.length">
            <div class="section-label">Albums</div>
            <AlbumListRow
              v-for="album in body.sections.albums"
              :key="'sal-' + album.id"
              :album="album"
              @open="openAlbum"
            />
          </template>
          <template v-if="body.sections.tracks.length">
            <div class="section-label">Tracks</div>
            <TrackRow
              v-for="track in body.sections.tracks"
              :key="'st-' + track.id"
              :track="track"
              title-mode="title"
              subtitle-mode="artist-album"
            />
          </template>
        </template>
      </div>
    </section>
  `,
});
