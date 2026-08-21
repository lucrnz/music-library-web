<script setup lang="ts">
/**
 * Library pane: online + downloads browse via BrowseSource pieces.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { openCropFromFile } from "@/artistArt/pickFile";
import { submitPreferredCrop } from "@/artistArt/submit";
import { buildAlbumMenuItems } from "@/components/library/albumMenuItems";
import {
  buildArtistMenuItems,
  runArtistDownloadAll,
} from "@/components/library/artistMenuItems";
import { buildFolderMenuItems } from "@/components/library/folderMenuItems";
import { buildTrackMenuItems } from "@/components/library/trackMenuItems";
import { type OpenMenu } from "@/components/library/entityMenu";
import type { EntityActions } from "@/components/library/EntityListHost.vue";
import { queueOnly } from "@/components/library/rows";
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
  addAllForAlbum,
  addAllForArtist,
  addAllForFolder,
  addSelected as addSelectedAction,
  downloadAlbumById,
  downloadCurrentAlbum as downloadAlbumAction,
} from "@/components/library/libraryActions";
import {
  type LibraryAlbum,
  type LibraryBody,
  type LibraryPage,
} from "@/components/library/loaders";
import { useBrowseLayout } from "@/components/library/useBrowseLayout";
import { useLibraryLocation } from "@/components/library/useLibraryLocation";
import {
  addAllDownloadedAlbum,
  addAllDownloadedArtist,
  downloadsAddAll,
  downloadsAlbumCover,
  downloadsArtistCover,
  downloadsGoBack,
  downloadsOpenAlbum,
  downloadsOpenArtist,
  downloadsShowAddAll,
  downloadsTrackCover,
  loadDownloadsPage,
} from "@/components/library/sources/downloadsBrowse";
import {
  loadOnlinePage,
  onlineAddAll,
  onlineArtistCover,
  onlineGoBack,
  onlineOpenAlbum,
  onlineOpenArtist,
  onlineOpenFolder,
  onlineShowAddAll,
  onlineShowAddSelected,
  onlineShowDownloadAlbum,
} from "@/components/library/sources/onlineBrowse";
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

const isDownloads = computed(() => mode.value === "downloads");
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
const showAddAll = computed(() =>
  isDownloads.value
    ? downloadsShowAddAll({
        showTree: showTree.value,
        trackCount: trackCount.value,
      })
    : onlineShowAddAll({
        showTree: showTree.value,
        mode: mode.value,
        artistId: artistId.value,
        albumId: albumId.value,
      }),
);
const showAddSelected = computed(() =>
  isDownloads.value
    ? false
    : onlineShowAddSelected({
        mode: mode.value,
        selectedCount: selectedCount.value,
        showTree: showTree.value,
        layout: ui.libraryLayout,
      }),
);
const showDownloadAlbum = computed(() =>
  isDownloads.value
    ? false
    : onlineShowDownloadAlbum({
        showTree: showTree.value,
        enabled: downloads.enabled,
        albumId: albumId.value,
        trackCount: trackCount.value,
      }),
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
    pane: isDownloads.value ? "downloads" : "library",
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
  if (!isDownloads.value) clearLibSelection();
  error.value = "";
  loading.value = true;

  try {
    const page = isDownloads.value
      ? await loadDownloadsPage({
          routeName: String(routeName.value || ""),
          artistId: artistId.value,
          albumId: albumId.value,
          enabled: downloads.enabled,
        })
      : await loadOnlinePage({
          mode: mode.value,
          routeName: routeName.value,
          folderPath: folderPath.value,
          artistId: artistId.value,
          albumId: albumId.value,
          searchQuery:
            (searchQuery.value || "").trim() ||
            String(libLoc.value.query?.q || "").trim(),
        });
    if (!isCurrent(seq)) return;
    applyPage(page);
    hasLoadedOnce.value = true;
    if (!isDownloads.value) noteServerReachable();
  } catch (err: unknown) {
    if (!isCurrent(seq)) return;
    const msg = err instanceof Error ? err.message : String(err);
    if (!isDownloads.value) {
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
  if (isDownloads.value) {
    downloadsGoBack(router, {
      routeName: routeName.value,
      backArtistId: backArtistId.value,
    });
    return;
  }
  onlineGoBack(router, {
    mode: mode.value,
    routeName: routeName.value,
    folderPath: folderPath.value,
    backArtistId: backArtistId.value,
  });
}

function openFolder(dir: BrowseDir) {
  onlineOpenFolder(router, dir);
}

function openArtist(artist: { id: string }) {
  if (isDownloads.value) downloadsOpenArtist(router, artist);
  else onlineOpenArtist(router, artist);
}

function openAlbum(album: { id: string }) {
  if (isDownloads.value) downloadsOpenAlbum(router, album);
  else onlineOpenAlbum(router, album);
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
  if (isDownloads.value) {
    const tracks = body.value.kind === "tracks" ? body.value.tracks : [];
    await downloadsAddAll(tracks);
    return;
  }
  await onlineAddAll(
    {
      mode: mode.value,
      routeName: routeName.value,
      folderPath: folderPath.value,
      artistId: artistId.value,
      albumId: albumId.value,
      searchQuery: searchQuery.value,
    },
    { showTree: showTree.value },
  );
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

const includeArtistPhoto = computed(
  () => !isDownloads.value && mode.value === "artists" && !isSearch.value,
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
  itemsFor: (target) => {
    switch (target.kind) {
      case "artist":
        return buildArtistMenuItems({
          artist: target.artist,
          includePhoto: includeArtistPhoto.value,
          addAll: () =>
            isDownloads.value
              ? addAllDownloadedArtist(target.artist.id)
              : addAllForArtist(target.artist.id),
          downloadAll:
            !isDownloads.value && downloads.enabled
              ? () => runArtistDownloadAll(target.artist)
              : undefined,
        });
      case "album":
        return buildAlbumMenuItems({
          album: target.album,
          addAll: () =>
            isDownloads.value
              ? addAllDownloadedAlbum(target.album.id)
              : addAllForAlbum(target.album.id),
          download:
            !isDownloads.value && downloads.enabled
              ? () => downloadAlbumById(target.album.id)
              : undefined,
        });
      case "track":
        return buildTrackMenuItems({
          title: target.track.title,
          artist: target.track.artist,
          album: target.track.album,
          addToPlaylist: () => queueOnly(target.track),
        });
      case "file": {
        const t = target.file.track;
        return buildTrackMenuItems({
          title: t?.title || target.file.displayName || target.file.name,
          artist: t?.artist,
          album: t?.album,
          addToPlaylist: () =>
            queueOnly(t || target.file.id || target.file.path),
        });
      }
      case "folder":
        return buildFolderMenuItems({
          dir: target.dir,
          addAll: () => addAllForFolder(target.dir.path || ""),
        });
    }
  },
});

function artistCover(artist: ArtistListItem) {
  return isDownloads.value
    ? downloadsArtistCover(artist, artUrls.value)
    : onlineArtistCover(artist);
}

function albumCover(album: LibraryAlbum) {
  return downloadsAlbumCover(album, artUrls.value);
}

function trackCover(track: Track) {
  return downloadsTrackCover(track, artUrls.value);
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
  ...(isDownloads.value
    ? {}
    : {
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
      }),
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
      :aria-label="isDownloads ? 'Downloads library' : 'Library'"
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
        :loading="isDownloads ? loading : false"
        :is-grid="isGrid"
        :grid-host="gridHost"
        :show-track-download="!isDownloads"
        :is-selected="isDownloads ? null : isSelected"
        :artist-cover="artistCover"
        :album-cover="isDownloads ? albumCover : null"
        :track-cover="isDownloads ? trackCover : null"
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
