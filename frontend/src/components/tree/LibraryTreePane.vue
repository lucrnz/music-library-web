<script setup lang="ts">
/**
 * Library tree pane: mode adapter + TreeView + group actions.
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
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
import { addAllDownloadedAlbum, addAllDownloadedArtist } from "@/downloads/addAll";
import {
  albumFromDl,
  artistFromDl,
  trackFromDl,
} from "@/components/tree/sources/downloadsMenuMap";
import { queueOnly } from "@/components/library/rows";
import type { LibraryAlbum } from "@/components/library/loaders";
import type {
  DownloadsHierarchyAlbum,
  DownloadsHierarchyArtist,
} from "@/downloads/hierarchy";
import ActionMenu from "@/components/menu/ActionMenu.vue";
import {
  isDesktopContextMenu,
  nextOpenKey,
} from "@/components/menu/rowActionMenu";
import { useRowActionMenu } from "@/components/menu/useRowActionMenu";
import { artUrlCache } from "@/downloads/catalog";
import { downloads } from "@/downloads/state";
import type { ArtistListItem } from "@/api";
import {
  clearLibSelection,
  toggleLibSelection,
  ui,
} from "@/stores/ui";
import Icon from "@/components/icons/Icon.vue";
import FileRow from "@/components/library/rows/FileRow.vue";
import TrackRow from "@/components/library/rows/TrackRow.vue";
import {
  addAllForAlbum,
  addAllForArtist,
  addAllForFolder,
  downloadAlbumById,
} from "@/components/library/libraryActions";
import {
  fromCatalogRecord,
  type Track,
} from "@/models/track";
import { playOrQueueTrack } from "@/components/library/rows";
import { listAlbumRoots, loadAlbumChildren } from "@/components/tree/sources/albumsSource";
import {
  listArtistRoots,
  loadArtistChildren,
  treeNodePath,
  type TreeNode,
} from "@/components/tree/sources/artistsSource";
import {
  loadDownloadsChildren,
  loadDownloadsTree,
  resolveDownloadsFocusPath,
  type DownloadsHierarchy,
} from "@/components/tree/sources/downloadsSource";
import {
  listFolderRoots,
  loadFolderNodeChildren,
} from "@/components/tree/sources/foldersSource";
import TreeView from "@/components/tree/TreeView.vue";
import type { TreeViewExpose } from "@/components/tree/TreeView.vue";
import {
  clearPendingFocusPath,
  getPendingFocusPath,
  treeNavState,
} from "@/components/tree/treeNavigation";
import { getTreeSession } from "@/components/tree/treeSession";
import type { FileRowModel } from "@/components/library/loaders";
import type { CatalogTrackRecord } from "@/models/track";

const props = defineProps<{
  mode: string;
}>();

const route = useRoute();
const artistsMode = computed(() => props.mode === "artists");
const {
  menuAnchor,
  menuRestoreEl,
  closeMenu,
  openMenu,
} = useRowActionMenu();
const menuKey = ref("");
const menuTarget = ref<OpenMenu | null>(null);
const menuOpen = computed(() => !!menuKey.value);
const downloadsMode = computed(() => props.mode === "downloads");
const menuItems = computed(() => {
  const target = menuTarget.value;
  if (!target) return [];
  const photo = artistsMode.value && target.kind === "artist";
  switch (target.kind) {
    case "artist":
      return buildArtistMenuItems({
        artist: target.artist,
        includePhoto: photo,
        addAll: () =>
          downloadsMode.value
            ? addAllDownloadedArtist(target.artist.id)
            : addAllForArtist(target.artist.id),
        downloadAll:
          !downloadsMode.value && downloads.enabled
            ? () => runArtistDownloadAll(target.artist)
            : undefined,
      });
    case "album":
      return buildAlbumMenuItems({
        album: target.album,
        addAll: () =>
          downloadsMode.value
            ? addAllDownloadedAlbum(target.album.id)
            : addAllForAlbum(target.album.id),
        download:
          !downloadsMode.value && downloads.enabled
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

function artistFromNode(node: TreeNode): ArtistListItem | null {
  if (node.kind !== "artist") return null;
  const data = node.data;
  if (!data || typeof data !== "object" || !("id" in data)) return null;
  return data as ArtistListItem;
}

function resolveCover(node: TreeNode): string {
  if (props.mode === "artists" && node.kind === "artist") {
    const artist = artistFromNode(node);
    return artist ? coverSrc(artist) : node.cover || "";
  }
  if (props.mode === "downloads" && node.kind === "dl-artist") {
    const data = node.data as DownloadsHierarchyArtist | undefined;
    const id = data?.artistId;
    return (id && artUrlCache.urls[`artist:${id}:thumb`]) || node.cover || "";
  }
  return node.cover || "";
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

function parentNameForAlbum(albumId: string): string {
  if (!downloadsHierarchy) return "";
  for (const ar of downloadsHierarchy.artists) {
    if (ar.albums.some((al) => al.albumId === albumId)) return ar.name;
  }
  return "";
}

function targetFromNode(node: TreeNode): OpenMenu | null {
  switch (node.kind) {
    case "artist": {
      const artist = artistFromNode(node);
      return artist ? { kind: "artist", artist } : null;
    }
    case "dl-artist": {
      const data = node.data as DownloadsHierarchyArtist | undefined;
      if (!data?.artistId) return null;
      return { kind: "artist", artist: artistFromDl(data) };
    }
    case "album": {
      const album = node.data as LibraryAlbum | undefined;
      if (!album?.id) return null;
      return { kind: "album", album };
    }
    case "dl-album": {
      const data = node.data as DownloadsHierarchyAlbum | undefined;
      if (!data?.albumId) return null;
      return {
        kind: "album",
        album: albumFromDl(data, parentNameForAlbum(data.albumId)),
      };
    }
    case "dir":
      return {
        kind: "folder",
        dir: { name: node.title, path: treeNodePath(node) },
      };
    case "track": {
      const track = asTrack(node.data);
      return track ? { kind: "track", track } : null;
    }
    case "dl-track": {
      try {
        return {
          kind: "track",
          track: trackFromDl(node.data as CatalogTrackRecord),
        };
      } catch {
        return null;
      }
    }
    case "file": {
      const file = fileFromNode(node);
      return file ? { kind: "file", file } : null;
    }
    default:
      return null;
  }
}

function onNodeMenuClick(node: TreeNode, e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
  const target = targetFromNode(node);
  const el = e.currentTarget;
  if (!target || !(el instanceof HTMLElement)) return;
  openEntityMenu(target, { kind: "el", el }, el);
}

function onLeafMenuClick(target: OpenMenu, e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
  const el = e.currentTarget;
  if (!(el instanceof HTMLElement)) return;
  openEntityMenu(target, { kind: "el", el }, el);
}

function onRowContextMenu(node: TreeNode, e: MouseEvent) {
  if (!isDesktopContextMenu()) return;
  const target = targetFromNode(node);
  if (!target) return;
  e.preventDefault();
  const btn =
    e.currentTarget instanceof HTMLElement
      ? e.currentTarget.querySelector(".row-menu")
      : null;
  openEntityMenu(
    target,
    { kind: "point", x: e.clientX, y: e.clientY },
    btn instanceof HTMLElement ? btn : null,
  );
}

async function onThumbDrop(node: TreeNode, file: File) {
  const artist = artistFromNode(node);
  if (!artist) return;
  const blob = await openCropFromFile(file);
  if (!blob) return;
  await submitPreferredCrop(artist, blob);
}

const treeListeners = computed(() => ({
  "row-contextmenu": onRowContextMenu,
  ...(artistsMode.value ? { "thumb-drop": onThumbDrop } : {}),
}));

watch(
  () => [route.fullPath, ui.libraryLayout, props.mode] as const,
  () => closeEntityMenu(),
);

const roots = ref<TreeNode[]>([]);
const loading = ref(false);
const error = ref("");
const treeRef = ref<TreeViewExpose | null>(null);
const artUrls = ref<Record<string, string>>({});
let loadSeq = 0;
let downloadsHierarchy: DownloadsHierarchy | null = null;

const session = computed(() => getTreeSession(props.mode));

const emptyMessage = computed(() => {
  if (props.mode === "downloads") {
    return downloads.enabled
      ? "No downloads yet"
      : "Enable downloads in Settings";
  }
  return "Nothing here yet";
});

const showTrackDownload = computed(() => props.mode !== "downloads");

function loadChildren(node: TreeNode) {
  if (props.mode === "artists") return loadArtistChildren(node);
  if (props.mode === "albums") return loadAlbumChildren(node);
  if (props.mode === "folders") return loadFolderNodeChildren(node);
  if (props.mode === "downloads") return loadDownloadsChildren(node);
  return Promise.resolve([] as TreeNode[]);
}

function nodeIndex() {
  const map = new Map<string, TreeNode>();
  function walk(nodes: TreeNode[] | undefined) {
    for (const n of nodes || []) {
      map.set(n.key, n);
      if (n.children) walk(n.children);
      const cached = session.value.getChildren(n.key);
      if (cached?.length) walk(cached);
    }
  }
  walk(roots.value);
  return map;
}

async function applyFocusPath() {
  let path = getPendingFocusPath();
  if (!path?.length) return;
  if (props.mode === "downloads" && downloadsHierarchy) {
    path = resolveDownloadsFocusPath(path, downloadsHierarchy);
  }
  clearPendingFocusPath();
  await nextTick();
  const map = nodeIndex();
  await treeRef.value?.expandPath(path, (key) => {
    if (map.has(key)) return map.get(key);
    const m2 = nodeIndex();
    return m2.get(key) || null;
  });
}

async function loadRoots() {
  const seq = ++loadSeq;
  loading.value = true;
  error.value = "";
  clearLibSelection();
  try {
    let next: TreeNode[] = [];
    artUrls.value = {};
    downloadsHierarchy = null;
    if (props.mode === "artists") {
      next = await listArtistRoots();
    } else if (props.mode === "albums") {
      next = await listAlbumRoots();
    } else if (props.mode === "folders") {
      next = await listFolderRoots();
    } else if (props.mode === "downloads") {
      if (!downloads.enabled) {
        next = [];
      } else {
        const packed = await loadDownloadsTree();
        next = packed.roots;
        artUrls.value = packed.artUrls;
        downloadsHierarchy = packed.hierarchy;
        for (const ar of next) {
          session.value.primeChildren(ar.key, ar.children || []);
          for (const al of ar.children || []) {
            session.value.primeChildren(al.key, al.children || []);
          }
        }
      }
    }
    if (seq !== loadSeq) return;
    roots.value = next;
    await applyFocusPath();
  } catch (err: unknown) {
    if (seq !== loadSeq) return;
    error.value = err instanceof Error ? err.message : String(err);
    roots.value = [];
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function fileFromNode(node: TreeNode): FileRowModel | null {
  const data = node.data;
  if (!data || typeof data !== "object") return null;
  const rec = data as FileRowModel;
  if (typeof rec.path !== "string") return null;
  return rec;
}

async function onActivateLeaf(node: TreeNode) {
  if (node.kind === "track" && node.data) {
    await playOrQueueTrack(node.data as Track);
    return;
  }
  if (node.kind === "file" && node.data) {
    const file = fileFromNode(node);
    const t = file?.track || file?.id;
    if (t) await playOrQueueTrack(t);
    return;
  }
  if (node.kind === "dl-track" && node.data) {
    try {
      await playOrQueueTrack(fromCatalogRecord(node.data as CatalogTrackRecord));
    } catch (err: unknown) {
      console.error(err);
    }
  }
}

function showGroupMenu(node: TreeNode) {
  return (
    node.kind === "artist" ||
    node.kind === "album" ||
    node.kind === "dir" ||
    node.kind === "dl-artist" ||
    node.kind === "dl-album"
  );
}

function isSelected(path: string) {
  return ui.libSelected.has(path);
}

function onSelectFile(file: FileRowModel) {
  toggleLibSelection(file.path, "file");
}

function onSelectDir(node: TreeNode, e?: MouseEvent) {
  e?.stopPropagation?.();
  toggleLibSelection(treeNodePath(node), "dir");
}

function asTrack(rec: unknown): Track | null {
  try {
    return fromCatalogRecord(rec as CatalogTrackRecord);
  } catch {
    return null;
  }
}

watch(
  () => props.mode,
  () => {
    loadRoots();
  },
);

watch(
  () => [downloads.enabled, downloads.trackCount],
  () => {
    if (props.mode === "downloads") loadRoots();
  },
);

watch(
  () => treeNavState.focusGen,
  () => {
    applyFocusPath();
  },
);

onMounted(loadRoots);
</script>

<template>
    <TreeView
      ref="treeRef"
      :roots="roots"
      :session="session"
      :load-children="loadChildren"
      :loading="loading"
      :error="error"
      :empty-message="emptyMessage"
      :resolve-cover="props.mode === 'artists' || props.mode === 'downloads' ? resolveCover : null"
      :thumb-drop-enabled="artistsMode"
      v-on="treeListeners"
      @activate-leaf="onActivateLeaf"
    >
      <template #group-actions="{ node }">
        <button
          v-if="node.kind === 'dir'"
          type="button"
          class="icon-btn"
          title="Select"
          aria-label="Select folder"
          :class="{ active: isSelected(treeNodePath(node)) }"
          @click="onSelectDir(node, $event)"
        ><Icon name="check" /></button>
        <button
          v-if="showGroupMenu(node)"
          type="button"
          class="icon-btn row-menu"
          title="More actions"
          aria-label="More actions"
          @click="(e) => onNodeMenuClick(node, e)"
        ><Icon name="more-vert" /></button>
      </template>
      <template #leaf="{ node }">
        <TrackRow
          v-if="node.kind === 'track'"
          :track="asTrack(node.data)"
          :show-download="showTrackDownload"
          :show-menu="true"
          @menu-click="(t, e) => onLeafMenuClick({ kind: 'track', track: t }, e)"
        />
        <FileRow
          v-else-if="node.kind === 'file'"
          :file="fileFromNode(node)"
          :selected="isSelected(treeNodePath(node))"
          :show-menu="true"
          @select="onSelectFile"
          @menu-click="(f, e) => onLeafMenuClick({ kind: 'file', file: f }, e)"
        />
        <TrackRow
          v-else-if="node.kind === 'dl-track'"
          :track="asTrack(node.data)"
          :show-download="false"
          title-mode="title"
          :show-menu="true"
          @menu-click="(t, e) => onLeafMenuClick({ kind: 'track', track: t }, e)"
        />
      </template>
    </TreeView>
    <ActionMenu
      :open="menuOpen"
      :items="menuItems"
      :anchor="menuAnchor"
      :restore-el="menuRestoreEl"
      @close="closeEntityMenu"
    />
</template>
