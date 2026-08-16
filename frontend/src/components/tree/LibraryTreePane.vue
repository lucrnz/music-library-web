<script setup lang="ts">
/**
 * Library tree pane: mode adapter + TreeView + group actions.
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { downloads } from "@/downloads/state";
import {
  clearLibSelection,
  showToast,
  toggleLibSelection,
  ui,
} from "@/stores/ui";
import { addToQueue } from "@/stores/playlist";
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
  tracksFromCatalogRecords,
  type Track,
} from "@/models/track";
import { playOrQueueTrack } from "@/components/library/rows";
import { listAlbumRoots, loadAlbumChildren } from "@/components/tree/sources/albumsSource";
import {
  listArtistRoots,
  loadArtistChildren,
  treeNodeId,
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

function catalogTracks(data: unknown): CatalogTrackRecord[] {
  if (!data || typeof data !== "object" || !("tracks" in data)) return [];
  const tracks = (data as { tracks?: unknown }).tracks;
  return Array.isArray(tracks) ? (tracks as CatalogTrackRecord[]) : [];
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

async function onDownloadAlbum(node: TreeNode) {
  await downloadAlbumById(treeNodeId(node));
}

const groupAddByKind: Record<string, (node: TreeNode) => Promise<void>> = {
  artist: async (node) => {
    await addAllForArtist(treeNodeId(node));
  },
  album: async (node) => {
    await addAllForAlbum(treeNodeId(node));
  },
  dir: async (node) => {
    await addAllForFolder(treeNodePath(node) || "");
  },
  "dl-album": async (node) => {
    await addToQueue(tracksFromCatalogRecords(catalogTracks(node.data)));
  },
};

function showGroupAdd(node: TreeNode) {
  return Boolean(groupAddByKind[node.kind]);
}

async function onGroupAdd(node: TreeNode) {
  const run = groupAddByKind[node.kind];
  if (!run) return;
  try {
    await run(node);
  } catch (err: unknown) {
    console.error(err);
    showToast(err instanceof Error ? err.message : "Failed to add to playlist");
  }
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

function showAlbumDownload(node: TreeNode) {
  return node.kind === "album" && downloads.enabled;
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
          v-if="showGroupAdd(node)"
          type="button"
          class="icon-btn"
          title="Add all to playlist"
          aria-label="Add all to playlist"
          @click="onGroupAdd(node)"
        ><Icon name="plus" /></button>
        <button
          v-if="showAlbumDownload(node)"
          type="button"
          class="icon-btn"
          title="Download album"
          aria-label="Download album"
          @click="onDownloadAlbum(node)"
        ><Icon name="download" /></button>
      </template>
      <template #leaf="{ node }">
        <TrackRow
          v-if="node.kind === 'track'"
          :track="asTrack(node.data)"
          :show-download="showTrackDownload"
        />
        <FileRow
          v-else-if="node.kind === 'file'"
          :file="fileFromNode(node)"
          :selected="isSelected(treeNodePath(node))"
          @select="onSelectFile"
        />
        <TrackRow
          v-else-if="node.kind === 'dl-track'"
          :track="asTrack(node.data)"
          :show-download="false"
          title-mode="title"
        />
      </template>
    </TreeView>
</template>
