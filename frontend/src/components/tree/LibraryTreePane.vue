<script setup lang="ts">
/**
 * Library tree pane: mode adapter + TreeView + group actions.
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { openCropFromFile } from "@/artistArt/pickFile";
import { submitPreferredCrop } from "@/artistArt/submit";
import { browseSourceFor } from "@/components/library/browseSource";
import { type OpenMenu } from "@/components/library/entityMenu";
import { entityActionsFor } from "@/components/library/entityActions";
import { useEntityMenu } from "@/components/library/useEntityMenu";
import { downloadsBrowse } from "@/components/library/sources/downloadsBrowse";
import { onlineBrowse } from "@/components/library/sources/onlineBrowse";
import type { LibraryAlbum } from "@/components/library/loaders";
import ActionMenu from "@/components/menu/ActionMenu.vue";
import { isDesktopContextMenu } from "@/components/menu/rowActionMenu";
import { downloads } from "@/downloads/state";
import type { Artist } from "@/models/artist";
import {
  clearLibSelection,
  toggleLibSelection,
  ui,
} from "@/stores/ui";
import Icon from "@/components/icons/Icon.vue";
import FileRow from "@/components/library/rows/FileRow.vue";
import TrackRow from "@/components/library/rows/TrackRow.vue";

import type { Track } from "@/models/track";
import { playOrQueueTrack } from "@/components/library/rows";
import {
  treeNodePath,
  type TreeNode,
} from "@/components/tree/sources/artistsSource";
import TreeView from "@/components/tree/TreeView.vue";
import type { TreeViewExpose } from "@/components/tree/TreeView.vue";
import {
  clearPendingFocusPath,
  getPendingFocusPath,
  treeNavState,
} from "@/components/tree/treeNavigation";
import { getTreeSession, primePackedTree } from "@/components/tree/treeSession";
import type { FileRowModel } from "@/components/library/loaders";

const props = defineProps<{
  mode: string;
}>();

const route = useRoute();
const source = computed(() =>
  browseSourceFor(props.mode, onlineBrowse, downloadsBrowse),
);
const includeArtistPhoto = computed(() =>
  source.value.includeArtistPhoto({
    mode: props.mode,
    isSearch: false,
  }),
);
const {
  menuOpen,
  menuItems,
  menuAnchor,
  menuRestoreEl,
  closeEntityMenu,
  openEntityMenu,
} = useEntityMenu({
  itemsFor: (target) =>
    entityActionsFor(source.value, {
      downloadsEnabled: downloads.enabled,
      includePhoto: includeArtistPhoto.value && target.kind === "artist",
    })(target),
});

function artistFromNode(node: TreeNode): Artist | null {
  if (node.kind !== "artist") return null;
  const data = node.data;
  if (!data || typeof data !== "object" || !("id" in data)) return null;
  return data as Artist;
}

function resolveCover(node: TreeNode): string {
  return source.value.resolveCover(node, artUrls.value);
}

function targetFromNode(node: TreeNode): OpenMenu | null {
  switch (node.kind) {
    case "artist": {
      const artist = artistFromNode(node);
      return artist ? { kind: "artist", artist } : null;
    }
    case "album": {
      const album = node.data as LibraryAlbum | undefined;
      if (!album?.id) return null;
      return { kind: "album", album };
    }
    case "dir":
      return {
        kind: "folder",
        dir: { name: node.title, path: treeNodePath(node) },
      };
    case "track": {
      const track = node.data as Track | undefined;
      return track?.id ? { kind: "track", track } : null;
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
  ...(includeArtistPhoto.value ? { "thumb-drop": onThumbDrop } : {}),
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

const session = computed(() => getTreeSession(props.mode));

const emptyMessage = computed(() =>
  source.value.emptyTreeMessage({ downloadsEnabled: downloads.enabled }),
);

const showTrackDownload = computed(() => source.value.showTrackDownload);

function loadChildren(node: TreeNode) {
  return source.value.loadChildren(node);
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
  path = source.value.resolveFocusPath(path);
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
    const packed = await source.value.loadRoots({
      mode: props.mode,
      routeName: route.name,
      folderPath: "",
      searchQuery: "",
      downloadsEnabled: downloads.enabled,
    });
    if (seq !== loadSeq) return;
    artUrls.value = packed.artUrls || {};
    if (packed.roots.some((n) => n.children?.length)) {
      primePackedTree(session.value, packed.roots);
    }
    roots.value = packed.roots;
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
  }
}

function showGroupMenu(node: TreeNode) {
  return (
    node.kind === "artist" ||
    node.kind === "album" ||
    node.kind === "dir"
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

watch(
  () => props.mode,
  () => {
    loadRoots();
  },
);

watch(
  () => source.value.treeReloadKeys().join("\0"),
  (key) => {
    if (key) loadRoots();
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
      :resolve-cover="resolveCover"
      :thumb-drop-enabled="includeArtistPhoto"
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
          :track="node.data as Track"
          :show-download="showTrackDownload"
          :title-mode="showTrackDownload ? undefined : 'title'"
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
