/**
 * Offline downloads mini-library (artist → album → tracks).
 */
import {
  computed,
  defineComponent,
  ref,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { connectivityBanner } from "../../connectivity.js";
import { loadDownloadsView } from "../../downloads/browse.js";
import { downloads } from "../../downloads/state.js";
import { connectivity } from "../../stores/connectivity.js";
import { addToQueue } from "../../stores/playlist.js";
import { ui } from "../../stores/ui.js";
import {
  browseGridHost,
  browseIsGrid,
  downloadsShowLayoutToggle,
  downloadsShowTree,
} from "../library/browseChrome.js";
import EntityListHost from "../library/EntityListHost.js";
import LibraryChrome from "../library/LibraryChrome.js";
import { useBrowseLayout } from "../library/useBrowseLayout.js";
import LibraryTreePane from "../tree/LibraryTreePane.js";

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

    const routeName = computed(() => route.name);
    const artistId = computed(() => route.params?.artistId);
    const albumId = computed(() => route.params?.albumId);

    const showTree = computed(() =>
      downloadsShowTree({
        layout: ui.libraryLayout,
        routeMode: route.meta?.mode,
      })
    );

    const showAddAll = computed(() => {
      if (showTree.value) return false;
      return Boolean(tracks.value.length);
    });

    const showLayoutToggle = computed(() =>
      downloadsShowLayoutToggle({
        showTree: showTree.value,
        routeName: String(routeName.value || ""),
      })
    );
    const isGrid = computed(() =>
      browseIsGrid({
        showLayoutToggle: showLayoutToggle.value,
        layout: ui.libraryLayout,
      })
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

    const gridHost = computed(() =>
      browseGridHost({
        isGrid: isGrid.value,
        bodyKind: body.value.kind,
        pane: "downloads",
      })
    );

    function isCurrent(seq) {
      return seq === renderSeq;
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

    const { watchNavigation } = useBrowseLayout({
      router,
      route,
      isActivePane: () => route.meta?.mode === "downloads",
      isTreeActive: () =>
        ui.libraryLayout === "tree" && route.meta?.mode === "downloads",
      onNavigate: () => load(),
      coldStartOnSetup: true,
    });

    watchNavigation(
      () => [
        route.fullPath,
        downloads.enabled,
        downloads.trackCount,
        ui.libraryLayout,
      ],
      { immediate: true }
    );

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
