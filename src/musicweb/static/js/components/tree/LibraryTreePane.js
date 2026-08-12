/**
 * Library tree pane: mode adapter + TreeView + group actions.
 */
import {
  computed,
  defineComponent,
  nextTick,
  onMounted,
  ref,
  watch,
} from "vue";
import { downloads } from "../../downloads/state.js";
import {
  clearLibSelection,
  toggleLibSelection,
  ui,
} from "../../stores/ui.js";
import Icon from "../icons/Icon.js";
import FileRow from "../library/rows/FileRow.js";
import TrackRow from "../library/rows/TrackRow.js";
import {
  addAllForAlbum,
  addAllForArtist,
  addAllForFolder,
  downloadAlbumById,
} from "../library/libraryActions.js";
import { fromCatalogRecord } from "../../models/track.js";
import { playOrQueueTrack } from "../library/rows.js";
import { listAlbumRoots, loadAlbumChildren } from "./sources/albumsSource.js";
import {
  listArtistRoots,
  loadArtistChildren,
} from "./sources/artistsSource.js";
import {
  loadDownloadsChildren,
  loadDownloadsTree,
  resolveDownloadsFocusPath,
} from "./sources/downloadsSource.js";
import {
  listFolderRoots,
  loadFolderNodeChildren,
} from "./sources/foldersSource.js";
import TreeView from "./TreeView.js";
import {
  clearPendingFocusPath,
  getPendingFocusPath,
  treeNavState,
} from "./treeNavigation.js";
import { getTreeSession } from "./treeSession.js";

export default defineComponent({
  name: "LibraryTreePane",
  components: { TreeView, TrackRow, FileRow, Icon },
  props: {
    /** folders | artists | albums | downloads */
    mode: { type: String, required: true },
  },
  setup(props) {
    const roots = ref([]);
    const loading = ref(false);
    const error = ref("");
    const treeRef = ref(null);
    /** @type {import('vue').Ref<Record<string, string>>} */
    const artUrls = ref({});
    let loadSeq = 0;
    /** @type {object|null} */
    let downloadsHierarchy = null;

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

    function loadChildren(node) {
      if (props.mode === "artists") return loadArtistChildren(node);
      if (props.mode === "albums") return loadAlbumChildren(node);
      if (props.mode === "folders") return loadFolderNodeChildren(node);
      if (props.mode === "downloads") return loadDownloadsChildren(node);
      return Promise.resolve([]);
    }

    function nodeIndex() {
      /** @type {Map<string, object>} */
      const map = new Map();
      function walk(nodes) {
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
        // After expands, refresh map from session cache
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
        let next = [];
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
            // Prime session cache with in-memory children
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
      } catch (err) {
        if (seq !== loadSeq) return;
        error.value = err?.message || String(err);
        roots.value = [];
      } finally {
        if (seq === loadSeq) loading.value = false;
      }
    }

    async function onActivateLeaf(node) {
      if (node.kind === "track" && node.data) {
        await playOrQueueTrack(node.data);
        return;
      }
      if (node.kind === "file" && node.data) {
        const t = node.data.track || node.data.id;
        if (t) await playOrQueueTrack(t);
        return;
      }
      if (node.kind === "dl-track" && node.data) {
        try {
          await playOrQueueTrack(fromCatalogRecord(node.data));
        } catch (err) {
          console.error(err);
        }
      }
    }

    async function onAddArtist(node) {
      try {
        await addAllForArtist(node.data?.id);
      } catch (err) {
        console.error(err);
      }
    }

    async function onAddAlbum(node) {
      try {
        await addAllForAlbum(node.data?.id);
      } catch (err) {
        console.error(err);
      }
    }

    async function onDownloadAlbum(node) {
      await downloadAlbumById(node.data?.id);
    }

    async function onAddFolder(node) {
      try {
        await addAllForFolder(node.data?.path || "");
      } catch (err) {
        console.error(err);
      }
    }

    function isSelected(path) {
      return ui.libSelected.has(path);
    }

    function onSelectFile(file) {
      toggleLibSelection(file.path, "file");
    }

    function onSelectDir(node, e) {
      e?.stopPropagation?.();
      toggleLibSelection(node.data.path, "dir");
    }

    function showGroupAdd(node) {
      return (
        node.kind === "artist" ||
        node.kind === "album" ||
        node.kind === "dir"
      );
    }

    function showAlbumDownload(node) {
      return node.kind === "album" && downloads.enabled;
    }

    /** @param {object} rec */
    function asTrack(rec) {
      try {
        return fromCatalogRecord(rec);
      } catch {
        return { id: rec?.trackId || "", title: rec?.title || "" };
      }
    }

    watch(
      () => [props.mode, downloads.enabled, downloads.trackCount],
      () => loadRoots(),
      { immediate: true }
    );

    watch(
      () => treeNavState.focusGen,
      () => {
        if (getPendingFocusPath()?.length && roots.value.length) {
          applyFocusPath();
        }
      }
    );

    onMounted(() => {
      if (getPendingFocusPath()?.length) applyFocusPath();
    });

    return {
      roots,
      loading,
      error,
      session,
      treeRef,
      emptyMessage,
      showTrackDownload,
      loadChildren,
      onActivateLeaf,
      onAddArtist,
      onAddAlbum,
      onDownloadAlbum,
      onAddFolder,
      isSelected,
      onSelectFile,
      onSelectDir,
      showGroupAdd,
      showAlbumDownload,
      asTrack,
      downloads,
    };
  },
  template: `
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
          :class="{ active: isSelected(node.data.path) }"
          @click="onSelectDir(node, $event)"
        ><Icon name="check" /></button>
        <button
          v-if="showGroupAdd(node)"
          type="button"
          class="icon-btn"
          title="Add all to playlist"
          aria-label="Add all to playlist"
          @click="node.kind === 'artist' ? onAddArtist(node) : node.kind === 'album' ? onAddAlbum(node) : onAddFolder(node)"
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
          :track="node.data"
          :show-download="showTrackDownload"
        />
        <FileRow
          v-else-if="node.kind === 'file'"
          :file="node.data"
          :selected="isSelected(node.data.path)"
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
  `,
});
