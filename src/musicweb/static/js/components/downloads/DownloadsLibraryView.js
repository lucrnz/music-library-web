/**
 * Offline downloads mini-library (artist → album → tracks).
 */
import {
  computed,
  defineComponent,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { connectivityBanner } from "../../connectivity.js";
import { loadDownloadsView } from "../../downloads/browse.js";
import { downloads } from "../../downloads/state.js";
import { connectivity } from "../../stores/connectivity.js";
import { addToQueue } from "../../stores/playlist.js";
import { ui } from "../../stores/ui.js";
import EntityListHost from "../library/EntityListHost.js";
import LibraryChrome from "../library/LibraryChrome.js";
import LibraryTreePane from "../tree/LibraryTreePane.js";
import { getTreeSession } from "../tree/treeSession.js";
import {
  handleLayoutTransition,
  handleTreeRoute,
  libraryMode,
} from "../tree/treeNavigation.js";

export default defineComponent({
  name: "DownloadsLibraryView",
  components: {
    LibraryChrome,
    EntityListHost,
    LibraryTreePane,
  },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const title = ref("Downloads");
    const showBack = ref(false);
    const emptyMsg = ref("");
    const error = ref("");
    const loading = ref(false);
    const artists = ref([]);
    const albums = ref([]);
    const tracks = ref([]);
    /** True when the page is an albums collection (not tracks). */
    const albumsPage = ref(false);
    const localArt = ref({});
    /** Parent artist for album-detail Back (hierarchical, not history). */
    const parentArtistId = ref(/** @type {string|null} */ (null));
    let renderSeq = 0;
    let prevLayout = ui.libraryLayout;
    /** @type {string|null} */
    let prevTreeMode = null;

    const routeName = computed(() => route.name);
    const artistId = computed(() => route.params?.artistId);
    const albumId = computed(() => route.params?.albumId);

    const showTree = computed(
      () =>
        ui.libraryLayout === "tree" && route.meta?.mode === "downloads"
    );

    const showAddAll = computed(() => {
      if (showTree.value) return false;
      return Boolean(tracks.value.length);
    });

    /** Hide toggle on album track pages (list/grid); tree always offers menu at roots. */
    const showLayoutToggle = computed(() => {
      if (showTree.value) return true;
      return String(routeName.value || "") !== "downloads-album";
    });
    const isGrid = computed(
      () => showLayoutToggle.value && ui.libraryLayout === "grid"
    );

    /** Map downloads page data into EntityListHost body kinds. */
    const body = computed(() => {
      if (artists.value.length) {
        return { kind: "artists", artists: artists.value };
      }
      if (albumsPage.value && albums.value.length) {
        return { kind: "albumGrid", albums: albums.value };
      }
      if (tracks.value.length) {
        return { kind: "tracks", tracks: tracks.value };
      }
      return { kind: "empty", message: emptyMsg.value || "" };
    });

    const gridHost = computed(() => {
      if (!isGrid.value) return false;
      const k = body.value.kind;
      return k === "artists" || k === "albumGrid";
    });

    function isCurrent(seq) {
      return seq === renderSeq;
    }

    function replaceRoute(loc) {
      if (!loc) return;
      router.replace({
        name: loc.name,
        params: loc.params || {},
        query: loc.query || {},
      });
    }

    async function load() {
      if (showTree.value) {
        title.value = "Downloads";
        showBack.value = false;
        error.value = "";
        loading.value = false;
        artists.value = [];
        albums.value = [];
        tracks.value = [];
        return;
      }

      const seq = ++renderSeq;
      error.value = "";
      emptyMsg.value = "";
      artists.value = [];
      albums.value = [];
      tracks.value = [];
      albumsPage.value = false;
      loading.value = true;
      try {
        const view = await loadDownloadsView({
          routeName: String(routeName.value || "downloads"),
          artistId: artistId.value ? String(artistId.value) : undefined,
          albumId: albumId.value ? String(albumId.value) : undefined,
          enabled: downloads.enabled,
        });
        if (!isCurrent(seq)) return;
        title.value = view.title;
        showBack.value = view.showBack;
        emptyMsg.value = view.emptyMsg;
        artists.value = view.artists;
        albums.value = view.albums;
        tracks.value = view.tracks;
        albumsPage.value = view.albumGrid;
        localArt.value = view.artUrls;
        parentArtistId.value = view.parentArtistId
          ? String(view.parentArtistId)
          : null;
      } catch (err) {
        if (!isCurrent(seq)) return;
        error.value = err.message || String(err);
      } finally {
        if (isCurrent(seq)) loading.value = false;
      }
    }

    /** Hierarchical parent only — never history.back() (can unload the page). */
    function goBack() {
      if (routeName.value === "downloads-album") {
        if (parentArtistId.value) {
          router.push({
            name: "downloads-artist",
            params: { artistId: parentArtistId.value },
          });
          return;
        }
        router.push({ name: "downloads" });
        return;
      }
      if (routeName.value === "downloads-artist") {
        router.push({ name: "downloads" });
      }
    }

    function openArtist(artist) {
      router.push({
        name: "downloads-artist",
        params: { artistId: artist.id },
      });
    }

    function openAlbum(album) {
      router.push({
        name: "downloads-album",
        params: { albumId: album.id },
      });
    }

    async function addAll() {
      try {
        if (tracks.value.length) await addToQueue(tracks.value);
      } catch (err) {
        console.error(err);
      }
    }

    function albumCover(album) {
      return localArt.value[`al:${album.id}`] || "";
    }

    function artistCover(artist) {
      return localArt.value[`a:${artist.id}`] || "";
    }

    function trackCover(track) {
      const id = track.albumId;
      return (id && localArt.value[`al:${id}`]) || "";
    }

    watch(
      () => ui.libraryLayout,
      (next, prev) => {
        if (next === prev) return;
        if (route.meta?.mode !== "downloads") {
          prevLayout = next;
          return;
        }
        const result = handleLayoutTransition({
          prevLayout: prev,
          nextLayout: next,
          route,
          isColdStart: false,
        });
        prevLayout = next;
        if (result.restoreSnapshot) {
          const s = result.restoreSnapshot;
          replaceRoute({
            name: s.name,
            params: s.params,
            query: s.query,
          });
          return;
        }
        if (result.replaceTo) replaceRoute(result.replaceTo);
        if (next === "tree") prevTreeMode = libraryMode(route);
      }
    );

    watch(
      () => [
        route.fullPath,
        downloads.enabled,
        downloads.trackCount,
        ui.libraryLayout,
      ],
      () => {
        if (
          ui.libraryLayout === "tree" &&
          route.meta?.mode === "downloads"
        ) {
          const r = handleTreeRoute({
            route,
            prevMode: prevTreeMode,
          });
          if (r.collapseScope) {
            getTreeSession(r.collapseScope).collapseAll();
          }
          if (r.replaceTo) {
            prevTreeMode = libraryMode(route);
            replaceRoute(r.replaceTo);
            return;
          }
          prevTreeMode = libraryMode(route);
        }
        load();
      },
      { immediate: true }
    );

    // Cold start already in tree on a downloads deep link.
    if (ui.libraryLayout === "tree" && route.meta?.mode === "downloads") {
      const result = handleLayoutTransition({
        prevLayout: "tree",
        nextLayout: "tree",
        route,
        isColdStart: true,
      });
      if (result.replaceTo) replaceRoute(result.replaceTo);
      prevTreeMode = libraryMode(route);
    }

    const offlineBanner = computed(() =>
      connectivityBanner(connectivity.state, downloads.enabled)
    );

    return {
      title,
      showBack,
      error,
      loading,
      body,
      showAddAll,
      showLayoutToggle,
      showTree,
      isGrid,
      gridHost,
      goBack,
      openArtist,
      openAlbum,
      addAll,
      albumCover,
      artistCover,
      trackCover,
      offlineBanner,
    };
  },
  template: `
    <LibraryChrome
      aria-label="Downloads library"
      :title="title"
      :show-back="showBack && !showTree"
      :offline-banner="offlineBanner"
      :show-layout-toggle="showLayoutToggle"
      @back="goBack"
    >
      <template #actions>
        <button
          v-if="showAddAll"
          type="button"
          class="pill"
          @click="addAll"
        >Add all</button>
      </template>

      <LibraryTreePane v-if="showTree" mode="downloads" />
      <EntityListHost
        v-else
        :body="body"
        :error="error"
        :loading="loading"
        :is-grid="isGrid"
        :grid-host="gridHost"
        :show-track-download="false"
        :artist-cover="artistCover"
        :album-cover="albumCover"
        :track-cover="trackCover"
        @open-artist="openArtist"
        @open-album="openAlbum"
      />
    </LibraryChrome>
  `,
});
