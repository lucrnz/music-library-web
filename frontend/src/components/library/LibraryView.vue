<script setup lang="ts">
/**
 * Library pane: online + downloads browse via BrowseSource.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { openCropFromFile } from "@/artistArt/pickFile";
import { submitPreferredCrop } from "@/artistArt/submit";
import { browseSourceFor } from "@/components/library/browseSource";
import { type OpenMenu } from "@/components/library/entityMenu";
import { entityActionsFor } from "@/components/library/entityActions";
import type { EntityActions } from "@/components/library/EntityListHost.vue";
import ActionMenu from "@/components/menu/ActionMenu.vue";
import { useEntityMenu } from "@/components/library/useEntityMenu";
import type { ArtistListItem, BrowseDir } from "@/api";
import {
  connectivityBanner,
  connectivityLoadError,
} from "@/connectivity";
import { downloads } from "@/downloads/state";
import {
  connectivity,
  noteServerReachable,
  noteServerUnreachable,
} from "@/stores/connectivity";
import {
  clearLibSelection,
  toggleLibSelection,
  ui,
} from "@/stores/ui";
import Icon from "@/components/icons/Icon.vue";
import LibraryTreePane from "@/components/tree/LibraryTreePane.vue";
import {
  browseGridHost,
  browseIsGrid,
  libraryShowLayoutToggle,
  libraryShowTree,
} from "@/components/library/browseChrome";
import EntityListHost from "@/components/library/EntityListHost.vue";
import LibraryChrome from "@/components/library/LibraryChrome.vue";
import StatsView from "@/components/stats/StatsView.vue";
import {
  addSelected as addSelectedAction,
  downloadCurrentAlbum as downloadAlbumAction,
} from "@/components/library/libraryActions";
import {
  type LibraryAlbum,
  type LibraryBody,
  type LibraryPage,
} from "@/components/library/loaders";
import { useBrowseLayout } from "@/components/library/useBrowseLayout";
import { useLibraryLocation } from "@/components/library/useLibraryLocation";
import { downloadsBrowse } from "@/components/library/sources/downloadsBrowse";
import { onlineBrowse } from "@/components/library/sources/onlineBrowse";
import type { FileRowModel } from "@/components/library/loaders";
import type { Track } from "@/models/track";

const INITIAL_BODY: LibraryBody = { kind: "empty", message: "" };
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

const source = computed(() =>
  browseSourceFor(mode.value, onlineBrowse, downloadsBrowse),
);
const loading = ref(false);
const error = ref("");
const title = ref("Folders");
const showBack = ref(false);
const backArtistId = ref<string | null>(null);
const body = ref<LibraryBody>(INITIAL_BODY);
const artUrls = ref<Record<string, string>>({});
const searchQuery = ref(route.query.q ? String(route.query.q) : "");
const hasLoadedOnce = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let renderSeq = 0;

const showTree = computed(() =>
  libraryShowTree({
    layout: ui.libraryLayout,
    isSearch: isSearch.value,
    mode: mode.value,
  }),
);

const selectedCount = computed(() => ui.libSelected.size);
const trackCount = computed(() =>
  body.value.kind === "tracks" ? body.value.tracks.length : 0,
);
const chromeInput = computed(() => ({
  showTree: showTree.value,
  mode: mode.value,
  artistId: artistId.value,
  albumId: albumId.value,
  trackCount: trackCount.value,
  selectedCount: selectedCount.value,
  layout: ui.libraryLayout,
  downloadsEnabled: downloads.enabled,
}));
const showAddAll = computed(() => source.value.showAddAll(chromeInput.value));
const showAddSelected = computed(() =>
  source.value.showAddSelected(chromeInput.value),
);
const showDownloadAlbum = computed(() =>
  source.value.showDownloadAlbum(chromeInput.value),
);

const showLayoutToggle = computed(() =>
  libraryShowLayoutToggle({
    isSearch: isSearch.value,
    mode: mode.value,
    showTree: showTree.value,
    albumId: albumId.value,
    bodyKind: body.value.kind,
  }),
);
const isGrid = computed(() =>
  browseIsGrid({
    showLayoutToggle: showLayoutToggle.value,
    layout: ui.libraryLayout,
  }),
);
const gridHost = computed(() =>
  browseGridHost({
    isGrid: isGrid.value,
    bodyKind: body.value.kind,
    pane: source.value.showFolderSelection ? "library" : "downloads",
  }),
);

function isCurrent(seq: number) {
  return seq === renderSeq;
}

const headerArtist = ref<ArtistListItem | null>(null);
const headerAlbum = ref<LibraryAlbum | null>(null);

function applyPage(page: LibraryPage) {
  title.value = page.chrome.title;
  showBack.value = page.chrome.showBack;
  backArtistId.value = page.chrome.backArtistId
    ? String(page.chrome.backArtistId)
    : null;
  body.value = page.body;
  headerArtist.value = page.headerArtist ?? null;
  headerAlbum.value = page.headerAlbum ?? null;
  artUrls.value = page.artUrls || {};
}

function applyTreeChrome() {
  const m = mode.value;
  title.value =
    m === "downloads"
      ? "Downloads"
      : m === "artists"
        ? "Artists"
        : m === "albums"
          ? "Albums"
          : "Folders";
  showBack.value = false;
  backArtistId.value = null;
  body.value = INITIAL_BODY;
  headerArtist.value = null;
  headerAlbum.value = null;
  artUrls.value = {};
}

async function load() {
  if (mode.value === "stats") {
    title.value = "Stats";
    showBack.value = false;
    backArtistId.value = null;
    body.value = INITIAL_BODY;
    headerArtist.value = null;
    headerAlbum.value = null;
    artUrls.value = {};
    hasLoadedOnce.value = true;
    loading.value = false;
    error.value = "";
    return;
  }
  if (showTree.value) {
    applyTreeChrome();
    hasLoadedOnce.value = true;
    loading.value = false;
    error.value = "";
    return;
  }

  const seq = ++renderSeq;
  if (source.value.clearsSelectionOnLoad) clearLibSelection();
  error.value = "";
  loading.value = true;

  try {
    const page = await source.value.load({
      mode: mode.value,
      routeName: routeName.value,
      folderPath: folderPath.value,
      artistId: artistId.value,
      albumId: albumId.value,
      searchQuery:
        (searchQuery.value || "").trim() ||
        String(libLoc.value.query?.q || "").trim(),
      downloadsEnabled: downloads.enabled,
    });
    if (!isCurrent(seq)) return;
    applyPage(page);
    hasLoadedOnce.value = true;
    if (source.value.reportsConnectivity) noteServerReachable();
  } catch (err: unknown) {
    if (!isCurrent(seq)) return;
    const msg = err instanceof Error ? err.message : String(err);
    if (source.value.reportsConnectivity) {
      noteServerUnreachable(err);
      error.value =
        connectivityLoadError(connectivity.state, downloads.enabled) || msg;
    } else {
      error.value = msg;
    }
    body.value = INITIAL_BODY;
  } finally {
    if (isCurrent(seq)) loading.value = false;
  }
}

const { coldStartTree, watchNavigation } = useBrowseLayout({
  router,
  route,
  isActivePane: () => route.meta.pane === "library",
  isTreeActive: () =>
    ui.libraryLayout === "tree" &&
    mode.value !== "search" &&
    mode.value !== "stats",
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
  () => [
    route.fullPath,
    route.query.q,
    ui.lastLibrary,
    ui.libraryLayout,
    downloads.enabled,
    downloads.trackCount,
  ],
);

onMounted(() => {
  coldStartTree();
  load();
});

function goBack() {
  source.value.goBack(router, {
    mode: mode.value,
    routeName: routeName.value,
    folderPath: folderPath.value,
    backArtistId: backArtistId.value,
  });
}

function openFolder(dir: BrowseDir) {
  source.value.openFolder?.(router, dir);
}

function openArtist(artist: { id: string }) {
  source.value.openArtist(router, artist);
}

function openAlbum(album: { id: string }) {
  source.value.openAlbum(router, album);
}

function isSelected(path: string) {
  return ui.libSelected.has(path);
}

function onFolderSelect(dir: { path: string }) {
  toggleLibSelection(dir.path, "dir");
}

function onFileSelect(file: FileRowModel) {
  toggleLibSelection(file.path, "file");
}

async function addAll() {
  const tracks = body.value.kind === "tracks" ? body.value.tracks : [];
  await source.value.addAll({
    loc: {
      mode: mode.value,
      routeName: routeName.value,
      folderPath: folderPath.value,
      artistId: artistId.value,
      albumId: albumId.value,
      searchQuery: searchQuery.value,
      downloadsEnabled: downloads.enabled,
    },
    showTree: showTree.value,
    tracks,
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
  connectivityBanner(connectivity.state, downloads.enabled),
);

const includeArtistPhoto = computed(() =>
  source.value.includeArtistPhoto({
    mode: mode.value,
    isSearch: isSearch.value,
  }),
);

const {
  menuOpen,
  menuItems,
  menuAnchor,
  menuRestoreEl,
  closeEntityMenu,
  onEntityMenuClick,
  onEntityContext,
} = useEntityMenu({
  itemsFor: (target) =>
    entityActionsFor(source.value, {
      downloadsEnabled: downloads.enabled,
      includePhoto: includeArtistPhoto.value,
    })(target),
});

function artistCover(artist: ArtistListItem) {
  return source.value.artistCover(artist, artUrls.value);
}

function albumCover(album: LibraryAlbum) {
  return source.value.albumCover(album, artUrls.value);
}

function trackCover(track: Track) {
  return source.value.trackCover(track, artUrls.value);
}

async function onArtistThumbDrop(artist: ArtistListItem, file: File) {
  const blob = await openCropFromFile(file);
  if (!blob) return;
  await submitPreferredCrop(artist, blob);
}

const entityActions = computed((): EntityActions => ({
  artist: {
    includePhoto: includeArtistPhoto.value,
    onMenuClick: (artist, e) =>
      onEntityMenuClick({ kind: "artist", artist }, e),
    onRowContextMenu: (artist, e) =>
      onEntityContext({ kind: "artist", artist }, e),
    onThumbDrop: includeArtistPhoto.value ? onArtistThumbDrop : undefined,
  },
  album: {
    onMenuClick: (album, e) =>
      onEntityMenuClick({ kind: "album", album }, e),
    onRowContextMenu: (album, e) =>
      onEntityContext({ kind: "album", album }, e),
  },
  track: {
    onMenuClick: (track, e) =>
      onEntityMenuClick({ kind: "track", track }, e),
    onRowContextMenu: (track, e) =>
      onEntityContext({ kind: "track", track }, e),
  },
  ...(source.value.showFolderSelection
    ? {
        folder: {
          onMenuClick: (dir: BrowseDir, e: MouseEvent) =>
            onEntityMenuClick({ kind: "folder", dir }, e),
          onRowContextMenu: (dir: BrowseDir, e: MouseEvent) =>
            onEntityContext({ kind: "folder", dir }, e),
        },
        file: {
          onMenuClick: (file: FileRowModel, e: MouseEvent) =>
            onEntityMenuClick({ kind: "file", file }, e),
          onRowContextMenu: (file: FileRowModel, e: MouseEvent) =>
            onEntityContext({ kind: "file", file }, e),
        },
      }
    : {}),
}));

const headerMenuTarget = computed((): OpenMenu | null => {
  if (headerArtist.value) {
    return { kind: "artist", artist: headerArtist.value };
  }
  if (headerAlbum.value) {
    return { kind: "album", album: headerAlbum.value };
  }
  return null;
});

function onHeaderMenuClick(e: MouseEvent) {
  const target = headerMenuTarget.value;
  if (!target) return;
  onEntityMenuClick(target, e);
}

watch(
  () => [route.fullPath, ui.libraryLayout, showTree.value] as const,
  () => closeEntityMenu(),
);
</script>

<template>
    <LibraryChrome
      :aria-label="source.ariaLabel"
      :title="title"
      :show-back="showBack && !showTree"
      :offline-banner="offlineBanner"
      :show-layout-toggle="showLayoutToggle"
      @back="goBack"
    >
      <template #actions>
        <button
          v-if="headerMenuTarget"
          type="button"
          class="icon-btn row-menu"
          title="More actions"
          aria-label="More actions"
          @click="onHeaderMenuClick"
        ><Icon name="more-vert" /></button>
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
      <StatsView v-else-if="mode === 'stats'" />
      <EntityListHost
        v-else
        :body="body"
        :error="error"
        :loading="source.showListLoading ? loading : false"
        :is-grid="isGrid"
        :grid-host="gridHost"
        :show-track-download="source.showTrackDownload"
        :is-selected="source.showFolderSelection ? isSelected : null"
        :artist-cover="artistCover"
        :album-cover="source.useLocalAlbumCover ? albumCover : null"
        :track-cover="source.useLocalTrackCover ? trackCover : null"
        :entity-actions="entityActions"
        @open-artist="openArtist"
        @open-album="openAlbum"
        @open-folder="openFolder"
        @select-folder="onFolderSelect"
        @select-file="onFileSelect"
      />
      <template #overlay>
        <ActionMenu
          :open="menuOpen"
          :items="menuItems"
          :anchor="menuAnchor"
          :restore-el="menuRestoreEl"
          @close="closeEntityMenu"
        />
      </template>
    </LibraryChrome>
</template>
