<script setup lang="ts">
/**
 * Online library pane: location → loaders → chrome + entity list / tree.
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { openCropFromFile } from "@/artistArt/pickFile";
import { coverSrc } from "@/artistArt/state";
import { submitPreferredCrop } from "@/artistArt/submit";
import { buildAlbumMenuItems } from "@/components/library/albumMenuItems";
import {
  buildArtistMenuItems,
  runArtistDownloadAll,
} from "@/components/library/artistMenuItems";
import { buildFolderMenuItems } from "@/components/library/folderMenuItems";
import { buildTrackMenuItems } from "@/components/library/trackMenuItems";
import {
  openMenuKey,
  type OpenMenu,
} from "@/components/library/entityMenu";
import type { EntityActions } from "@/components/library/EntityListHost.vue";
import { queueOnly } from "@/components/library/rows";
import ActionMenu from "@/components/menu/ActionMenu.vue";
import {
  isDesktopContextMenu,
  nextOpenKey,
} from "@/components/menu/rowActionMenu";
import { useRowActionMenu } from "@/components/menu/useRowActionMenu";
import type { ArtistListItem } from "@/api";
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
  addAll as addAllAction,
  addAllForAlbum,
  addAllForArtist,
  addAllForFolder,
  addSelected as addSelectedAction,
  downloadAlbumById,
  downloadCurrentAlbum as downloadAlbumAction,
} from "@/components/library/libraryActions";
import {
  loadLibraryPage,
  type LibraryAlbum,
  type LibraryBody,
  type LibraryPage,
} from "@/components/library/loaders";
import { useBrowseLayout } from "@/components/library/useBrowseLayout";
import { useLibraryLocation } from "@/components/library/useLibraryLocation";

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

    const loading = ref(false);
    const error = ref("");
    const title = ref("Folders");
    const showBack = ref(false);
    /** Parent artist id for album-detail Back (hierarchical, not history). */
    const backArtistId = ref<string | null>(null);
    const body = ref<LibraryBody>(INITIAL_BODY);
    const searchQuery = ref(route.query.q ? String(route.query.q) : "");
    /** True after at least one successful load for the library pane. */
    const hasLoadedOnce = ref(false);
    let searchTimer: ReturnType<typeof setTimeout> | null = null;
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

    function isCurrent(seq: number) {
      return seq === renderSeq;
    }

    /** @param {import("./loaders.js").LibraryPage} page */
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
    }

    function applyTreeChrome() {
      const m = mode.value;
      title.value =
        m === "artists" ? "Artists" : m === "albums" ? "Albums" : "Folders";
      showBack.value = false;
      backArtistId.value = null;
      body.value = INITIAL_BODY;
      headerArtist.value = null;
      headerAlbum.value = null;
    }

    async function load() {
      if (mode.value === "stats") {
        title.value = "Stats";
        showBack.value = false;
        backArtistId.value = null;
        body.value = INITIAL_BODY;
        headerArtist.value = null;
        headerAlbum.value = null;
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
      } catch (err: unknown) {
        if (!isCurrent(seq)) return;
        const msg = err instanceof Error ? err.message : String(err);
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

    function openFolder(dir: { path: string }) {
      router.push({ name: "folders", query: { path: dir.path } });
    }

    function openArtist(artist: { id: string }) {
      router.push({ name: "artist", params: { artistId: artist.id } });
    }

    function openAlbum(album: { id: string }) {
      router.push({ name: "album", params: { albumId: album.id } });
    }

    function isSelected(path: string) {
      return ui.libSelected.has(path);
    }

    function onFolderSelect(dir: { path: string }) {
      toggleLibSelection(dir.path, "dir");
    }

    function onFileSelect(file: { path: string }) {
      toggleLibSelection(file.path, "file");
    }

    async function addAll() {
      if (showTree.value && mode.value === "folders") {
        try {
          await addAllForFolder("");
        } catch (err: unknown) {
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

    const includeArtistPhoto = computed(
      () => mode.value === "artists" && !isSearch.value,
    );

    const {
      menuAnchor,
      menuRestoreEl,
      closeMenu,
      openMenu,
    } = useRowActionMenu();
    const menuKey = ref("");
    const menuTarget = ref<OpenMenu | null>(null);
    const menuOpen = computed(() => !!menuKey.value);
    const menuItems = computed(() => {
      const target = menuTarget.value;
      if (!target) return [];
      switch (target.kind) {
        case "artist":
          return buildArtistMenuItems({
            artist: target.artist,
            includePhoto: includeArtistPhoto.value,
            addAll: () => addAllForArtist(target.artist.id),
            downloadAll: downloads.enabled
              ? () => runArtistDownloadAll(target.artist)
              : undefined,
          });
        case "album":
          return buildAlbumMenuItems({
            album: target.album,
            addAll: () => addAllForAlbum(target.album.id),
            download: downloads.enabled
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
    });

    function artistCover(artist: ArtistListItem) {
      return coverSrc(artist);
    }

    function closeEntityMenu() {
      menuKey.value = "";
      menuTarget.value = null;
      closeMenu();
    }

    function openEntityMenu(
      target: OpenMenu,
      anchor: { kind: "el"; el: HTMLElement } | { kind: "point"; x: number; y: number },
      restoreEl?: HTMLElement | null,
    ) {
      const next = nextOpenKey(menuKey.value, openMenuKey(target));
      if (!next) {
        closeEntityMenu();
        return;
      }
      menuKey.value = next;
      menuTarget.value = target;
      openMenu(anchor, restoreEl);
    }

    function onEntityMenuClick(target: OpenMenu, e: MouseEvent) {
      const el = e.currentTarget;
      if (!(el instanceof HTMLElement)) return;
      openEntityMenu(target, { kind: "el", el }, el);
    }

    function onEntityContext(target: OpenMenu, e: MouseEvent) {
      if (!isDesktopContextMenu()) return;
      e.preventDefault();
      const current = e.currentTarget;
      const btn =
        current instanceof HTMLElement
          ? current.querySelector(".row-menu")
          : null;
      openEntityMenu(
        target,
        { kind: "point", x: e.clientX, y: e.clientY },
        btn instanceof HTMLElement ? btn : null,
      );
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
      folder: {
        onMenuClick: (dir, e) =>
          onEntityMenuClick({ kind: "folder", dir }, e),
        onRowContextMenu: (dir, e) =>
          onEntityContext({ kind: "folder", dir }, e),
      },
      file: {
        onMenuClick: (file, e) =>
          onEntityMenuClick({ kind: "file", file }, e),
        onRowContextMenu: (file, e) =>
          onEntityContext({ kind: "file", file }, e),
      },
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
      aria-label="Library"
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
        :is-grid="isGrid"
        :grid-host="gridHost"
        :is-selected="isSelected"
        :artist-cover="artistCover"
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
