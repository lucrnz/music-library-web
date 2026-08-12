/**
 * Online library pane: location → loaders → chrome + entity list / tree.
 */
import {
  computed,
  defineComponent,
  onMounted,
  ref,
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
import LibraryTreePane from "../tree/LibraryTreePane.js";
import {
  browseGridHost,
  browseIsGrid,
  libraryShowLayoutToggle,
  libraryShowTree,
} from "./browseChrome.js";
import EntityListHost from "./EntityListHost.js";
import LibraryChrome from "./LibraryChrome.js";
import {
  addAll as addAllAction,
  addAllForFolder,
  addSelected as addSelectedAction,
  downloadCurrentAlbum as downloadAlbumAction,
} from "./libraryActions.js";
import { loadLibraryPage } from "./loaders.js";
import { useBrowseLayout } from "./useBrowseLayout.js";
import { useLibraryLocation } from "./useLibraryLocation.js";

/** @type {import("./loaders.js").LibraryBody} */
const INITIAL_BODY = { kind: "empty", message: "" };

export default defineComponent({
  name: "LibraryView",
  components: {
    Icon,
    LibraryChrome,
    EntityListHost,
    LibraryTreePane,
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

    const showTree = computed(() =>
      libraryShowTree({
        layout: ui.libraryLayout,
        isSearch: isSearch.value,
        mode: mode.value,
      })
    );

    const selectedCount = computed(() => ui.libSelected.size);
    const showAddAll = computed(() => {
      if (showTree.value) {
        return mode.value === "folders";
      }
      if (mode.value === "search" && !artistId.value && !albumId.value) {
        return false;
      }
      if (mode.value === "folders") return true;
      return Boolean(artistId.value || albumId.value);
    });
    const showAddSelected = computed(
      () =>
        mode.value === "folders" &&
        selectedCount.value > 0 &&
        (showTree.value || ui.libraryLayout !== "tree")
    );
    const showDownloadAlbum = computed(() => {
      if (showTree.value) return false;
      return (
        downloads.enabled &&
        Boolean(albumId.value) &&
        body.value.kind === "tracks" &&
        body.value.tracks.length > 0
      );
    });

    const showLayoutToggle = computed(() =>
      libraryShowLayoutToggle({
        isSearch: isSearch.value,
        mode: mode.value,
        showTree: showTree.value,
        albumId: albumId.value,
        bodyKind: body.value.kind,
      })
    );
    const isGrid = computed(() =>
      browseIsGrid({
        showLayoutToggle: showLayoutToggle.value,
        layout: ui.libraryLayout,
      })
    );
    const gridHost = computed(() =>
      browseGridHost({
        isGrid: isGrid.value,
        bodyKind: body.value.kind,
        pane: "library",
      })
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

    function applyTreeChrome() {
      const m = mode.value;
      title.value =
        m === "artists" ? "Artists" : m === "albums" ? "Albums" : "Folders";
      showBack.value = false;
      backArtistId.value = null;
      body.value = INITIAL_BODY;
    }

    async function load() {
      if (showTree.value) {
        applyTreeChrome();
        hasLoadedOnce.value = true;
        loading.value = false;
        error.value = "";
        return;
      }

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

    const { coldStartTree, watchNavigation } = useBrowseLayout({
      router,
      route,
      isActivePane: () => route.meta.pane === "library",
      isTreeActive: () =>
        ui.libraryLayout === "tree" && mode.value !== "search",
      onNavigate: () => {
        if (route.meta.pane !== "library") {
          if (!hasLoadedOnce.value) load();
          return;
        }
        load();
      },
      onBeforeLoad: () => {
        if (mode.value === "search") {
          searchQuery.value = route.query.q ? String(route.query.q) : "";
        }
      },
    });

    watchNavigation(
      () => [route.fullPath, route.query.q, ui.lastLibrary, ui.libraryLayout]
    );

    onMounted(() => {
      coldStartTree();
      load();
    });

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
      if (showTree.value && mode.value === "folders") {
        try {
          await addAllForFolder("");
        } catch (err) {
          console.error(err);
        }
        return;
      }
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
      showTree,
      mode,
      isGrid,
      gridHost,
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
      :show-back="showBack && !showTree"
      :offline-banner="offlineBanner"
      :show-layout-toggle="showLayoutToggle"
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

      <LibraryTreePane v-if="showTree" :mode="mode" />
      <EntityListHost
        v-else
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
