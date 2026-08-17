<script setup lang="ts">
/**
 * Offline downloads mini-library (artist → album → tracks).
 */
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { connectivityBanner } from "@/connectivity";
import {
  loadDownloadsView,
  type DownloadsBrowseAlbum,
  type DownloadsBrowseArtist,
  type DownloadsBrowseState,
} from "@/downloads/browse";
import { downloads } from "@/downloads/state";
import { connectivity } from "@/stores/connectivity";
import { addToQueue } from "@/stores/playlist";
import { ui } from "@/stores/ui";
import {
  browseGridHost,
  browseIsGrid,
  downloadsShowLayoutToggle,
  downloadsShowTree,
} from "@/components/library/browseChrome";
import EntityListHost from "@/components/library/EntityListHost.vue";
import LibraryChrome from "@/components/library/LibraryChrome.vue";
import { useBrowseLayout } from "@/components/library/useBrowseLayout";
import LibraryTreePane from "@/components/tree/LibraryTreePane.vue";
import { artUrlCache } from "@/downloads/catalog";
import type { ArtistListItem } from "@/api";
import type { LibraryAlbum, LibraryBody } from "@/components/library/loaders";
import type { Track } from "@/models/track";

const route = useRoute();
const router = useRouter();
const title = ref("Downloads");
const showBack = ref(false);
const emptyMsg = ref("");
const error = ref("");
const loading = ref(false);
const artists = ref<DownloadsBrowseArtist[]>([]);
const albums = ref<DownloadsBrowseAlbum[]>([]);
const tracks = ref<Track[]>([]);
/** True when the page is an albums collection (not tracks). */
const albumsPage = ref(false);
const localArt = ref<Record<string, string>>({});
/** Parent artist for album-detail Back (hierarchical, not history). */
const parentArtistId = ref<string | null>(null);
let renderSeq = 0;

const routeName = computed(() => route.name);
const artistId = computed(() => {
  const v = route.params?.artistId;
  if (v == null || v === "") return undefined;
  return String(Array.isArray(v) ? v[0] : v);
});
const albumId = computed(() => {
  const v = route.params?.albumId;
  if (v == null || v === "") return undefined;
  return String(Array.isArray(v) ? v[0] : v);
});

const showTree = computed(() =>
  downloadsShowTree({
    layout: ui.libraryLayout,
    routeMode: typeof route.meta?.mode === "string" ? route.meta.mode : undefined,
  }),
);

const showAddAll = computed(() => {
  if (showTree.value) return false;
  return Boolean(tracks.value.length);
});

const showLayoutToggle = computed(() =>
  downloadsShowLayoutToggle({
    showTree: showTree.value,
    routeName: String(routeName.value || ""),
  }),
);
const isGrid = computed(() =>
  browseIsGrid({
    showLayoutToggle: showLayoutToggle.value,
    layout: ui.libraryLayout,
  }),
);

/** Map downloads page data into EntityListHost body kinds. */
const body = computed((): LibraryBody => {
  if (artists.value.length) {
    return { kind: "artists", artists: artists.value };
  }
  if (albumsPage.value || albums.value.length) {
    return { kind: "albumGrid", albums: albums.value };
  }
  if (tracks.value.length) {
    return { kind: "tracks", tracks: tracks.value };
  }
  return { kind: "empty", message: emptyMsg.value };
});

const gridHost = computed(() =>
  browseGridHost({
    isGrid: isGrid.value,
    bodyKind: body.value.kind,
    pane: "downloads",
  }),
);

function artistCover(artist: ArtistListItem) {
  return (
    artUrlCache.urls[`artist:${artist.id}:thumb`] ||
    localArt.value[`a:${artist.id}`] ||
    ""
  );
}
function albumCover(album: LibraryAlbum) {
  return localArt.value[`al:${album.id}`] || "";
}
function trackCover(track: Track) {
  return localArt.value[`al:${track.albumId}`] || "";
}

function applyState(st: DownloadsBrowseState) {
  title.value = st.title;
  showBack.value = st.showBack;
  emptyMsg.value = st.emptyMsg;
  artists.value = st.artists;
  albums.value = st.albums;
  tracks.value = st.tracks;
  albumsPage.value = st.albumGrid;
  localArt.value = st.artUrls || {};
  parentArtistId.value = st.parentArtistId || null;
}

function applyTreeChrome() {
  title.value = "Downloads";
  showBack.value = false;
  emptyMsg.value = "";
  artists.value = [];
  albums.value = [];
  tracks.value = [];
  albumsPage.value = false;
  localArt.value = {};
  parentArtistId.value = null;
}

async function load() {
  if (showTree.value) {
    applyTreeChrome();
    loading.value = false;
    error.value = "";
    return;
  }
  const seq = ++renderSeq;
  error.value = "";
  loading.value = true;
  try {
    const st = await loadDownloadsView({
      routeName: String(routeName.value || ""),
      artistId: artistId.value,
      albumId: albumId.value,
      enabled: downloads.enabled,
    });
    if (seq !== renderSeq) return;
    applyState(st);
  } catch (err: unknown) {
    if (seq !== renderSeq) return;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (seq === renderSeq) loading.value = false;
  }
}

useBrowseLayout({
  router,
  route,
  isActivePane: () => route.meta.mode === "downloads",
  isTreeActive: () => ui.libraryLayout === "tree",
  onNavigate: () => {
    load();
  },
  coldStartOnSetup: true,
}).watchNavigation(
  () => [route.fullPath, ui.libraryLayout, downloads.enabled, downloads.trackCount],
);

function goBack() {
  if (routeName.value === "downloads-album") {
    const aid = parentArtistId.value;
    if (aid) {
      router.push({ name: "downloads-artist", params: { artistId: aid } });
      return;
    }
    router.push({ name: "downloads" });
    return;
  }
  if (routeName.value === "downloads-artist") {
    router.push({ name: "downloads" });
    return;
  }
  router.push({ name: "downloads" });
}

function openArtist(artist: ArtistListItem) {
  router.push({ name: "downloads-artist", params: { artistId: artist.id } });
}

function openAlbum(album: LibraryAlbum) {
  router.push({ name: "downloads-album", params: { albumId: album.id } });
}

async function addAll() {
  try {
    await addToQueue(tracks.value);
  } catch (err: unknown) {
    console.error(err);
  }
}

const offlineBanner = computed(() =>
  connectivityBanner(connectivity.state, downloads.enabled),
);
</script>

<template>
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
</template>
