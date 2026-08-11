/**
 * Online library pane: location → loaders → chrome + entity list.
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
  connectivityBanner,
  connectivityLoadError,
} from "../../connectivity.js";
import { downloads } from "../../downloads/state.js";
import {
  connectivity,
  noteServerReachable,
  noteServerUnreachable,
} from "../../stores/connectivity.js";
import {
  clearLibSelection,
  toggleLibSelection,
  ui,
} from "../../stores/ui.js";
import Icon from "../icons/Icon.js";
import EntityListHost from "./EntityListHost.js";
import LibraryChrome from "./LibraryChrome.js";
import {
  addAll as addAllAction,
  addSelected as addSelectedAction,
  downloadCurrentAlbum as downloadAlbumAction,
} from "./libraryActions.js";
import { loadLibraryPage } from "./loaders.js";
import { useLibraryLocation } from "./useLibraryLocation.js";

/** @type {import("./loaders.js").LibraryBody} */
const INITIAL_BODY = { kind: "empty", message: "" };

export default defineComponent({
  name: "LibraryView",
  components: {
    Icon,
    LibraryChrome,
    EntityListHost,
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
          connectivityLoadError(connectivity.state, downloads.enabled) || msg;
        body.value = INITIAL_BODY;
      } finally {
        if (isCurrent(seq)) loading.value = false;
      }
      if (!error.value) {
        noteServerReachable();
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
        if (!hasLoadedOnce.value) {
          load();
        }
      }
    );

    onMounted(load);

    const offlineBanner = computed(() =>
      connectivityBanner(connectivity.state, downloads.enabled)
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
      offlineBanner,
    };
  },
  template: `
    <LibraryChrome
      aria-label="Library"
      :title="title"
      :show-back="showBack"
      :offline-banner="offlineBanner"
      :show-layout-toggle="showLayoutToggle"
      :layout-toggle-icon="layoutToggleIcon"
      :layout-toggle-label="layoutToggleLabel"
      @back="goBack"
    >
      <template #actions>
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
      </template>

      <template #after-bar>
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
      </template>

      <EntityListHost
        :body="body"
        :error="error"
        :is-grid="isGrid"
        :grid-host="gridHost"
        :is-selected="isSelected"
        @open-artist="openArtist"
        @open-album="openAlbum"
        @open-folder="openFolder"
        @select-folder="onFolderSelect"
        @select-file="onFileSelect"
      />
    </LibraryChrome>
  `,
});
