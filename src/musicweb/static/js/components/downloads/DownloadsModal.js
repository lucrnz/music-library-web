/**
 * Download manager: queue + collapsible artist → album → tracks hierarchy.
 */
import {
  computed,
  defineComponent,
  onUnmounted,
  ref,
  watch,
} from "vue";
import {
  cancelQueueItem,
  clearFinishedQueue,
  closeDownloadsManager,
  downloadsStorageLine,
  formatBytes,
  pauseAllDownloads,
  removeDownloadedAlbum,
  removeDownloadedArtist,
  removeDownloadedTrack,
  resumeAllDownloads,
  retryQueueItem,
} from "../../downloads/index.js";
import { downloads } from "../../downloads/state.js";
import { confirmDialog } from "../../stores/dialog.js";
import { settings } from "../../stores/settings.js";
import Icon from "../icons/Icon.js";
import {
  loadDownloadsChildren,
  loadDownloadsTree,
} from "../tree/sources/downloadsSource.js";
import TreeView from "../tree/TreeView.js";
import { createTreeSession } from "../tree/treeSession.js";

export default defineComponent({
  name: "DownloadsModal",
  components: { Icon, TreeView },
  setup() {
    const roots = ref([]);
    const loading = ref(false);
    const session = createTreeSession();

    const storageLine = computed(() => downloadsStorageLine("long"));

    const queueItems = computed(() => downloads.queue || []);

    const queueSummaryLine = computed(() => {
      const s = downloads.queueSummary;
      if (!s.total) return "";
      const parts = [];
      if (s.active) parts.push(`${s.active} downloading`);
      if (s.pending) parts.push(`${s.pending} queued`);
      if (s.paused) parts.push(`${s.paused} paused`);
      if (s.failed) parts.push(`${s.failed} failed`);
      if (s.knownTotal && s.totalBytes > 0) {
        const pct = Math.min(
          100,
          Math.round((s.loadedBytes / s.totalBytes) * 100)
        );
        parts.push(
          `${pct}% · ${formatBytes(s.loadedBytes)} / ${formatBytes(s.totalBytes)}`
        );
      } else if (s.loadedBytes > 0) {
        parts.push(formatBytes(s.loadedBytes));
      }
      return parts.join(" · ");
    });

    const showPauseAll = computed(() => {
      const s = downloads.queueSummary;
      if (downloads.userPaused) return false;
      return s.active + s.pending > 0;
    });

    const showResumeAll = computed(() => {
      return downloads.userPaused || !!downloads.autoPausedReason;
    });

    function codecLabel(codec) {
      const opt = settings.options.find((o) => o.id === codec);
      return opt?.label || codec || "—";
    }

    async function loadTree() {
      loading.value = true;
      try {
        const packed = await loadDownloadsTree();
        session.collapseAll();
        for (const ar of packed.roots) {
          session.primeChildren(ar.key, ar.children || []);
          for (const al of ar.children || []) {
            session.primeChildren(al.key, al.children || []);
          }
        }
        roots.value = packed.roots;
      } catch (err) {
        console.error(err);
        roots.value = [];
      } finally {
        loading.value = false;
      }
    }

    function onKey(e) {
      if (e.key === "Escape" && downloads.managerOpen) closeDownloadsManager();
    }

    watch(
      () => downloads.managerOpen,
      (open) => {
        if (open) {
          loadTree();
          document.addEventListener("keydown", onKey);
        } else {
          document.removeEventListener("keydown", onKey);
        }
      }
    );

    watch(
      () => downloads.trackCount,
      () => {
        if (downloads.managerOpen) loadTree();
      }
    );

    watch(
      () => downloads.queue.length,
      () => {
        if (downloads.managerOpen) loadTree();
      }
    );

    onUnmounted(() => document.removeEventListener("keydown", onKey));

    async function onDeleteTrack(trackId) {
      const ok = await confirmDialog({
        title: "Remove download",
        message: "Remove this download from this device?",
        confirmLabel: "Remove",
        danger: true,
      });
      if (!ok) return;
      await removeDownloadedTrack(trackId);
      await loadTree();
    }

    async function onDeleteAlbum(albumId, title) {
      const ok = await confirmDialog({
        title: "Delete album downloads",
        message: `Delete all downloaded tracks from “${title}”?`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      await removeDownloadedAlbum(albumId);
      await loadTree();
    }

    async function onDeleteArtist(artistId, name) {
      const ok = await confirmDialog({
        title: "Delete artist downloads",
        message: `Delete all downloaded tracks by “${name}”?`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      await removeDownloadedArtist(artistId);
      await loadTree();
    }

    async function onCancel(id) {
      await cancelQueueItem(id);
    }

    async function onRetry(id) {
      await retryQueueItem(id);
    }

    async function onClearFinished() {
      await clearFinishedQueue();
    }

    async function onPauseAll() {
      await pauseAllDownloads();
    }

    async function onResumeAll() {
      await resumeAllDownloads();
    }

    function progressPct(item) {
      if (!item.total || !item.loaded) return 0;
      return Math.min(100, Math.round((item.loaded / item.total) * 100));
    }

    function progressKnown(item) {
      return !!(item.total && item.total > 0);
    }

    function progressBytes(item) {
      const loaded = item.loaded || 0;
      if (progressKnown(item)) {
        return `${formatBytes(loaded)} / ${formatBytes(item.total)}`;
      }
      if (loaded > 0) return formatBytes(loaded);
      return "";
    }

    function stateLabel(item) {
      switch (item.state) {
        case "active":
          return "Downloading";
        case "pending":
          return "Queued";
        case "paused":
          return "Paused";
        case "failed":
          return "Failed";
        case "canceled":
          return "Canceled";
        default:
          return item.state || "";
      }
    }

    function showProgressBar(item) {
      return (
        item.state === "active" ||
        item.state === "paused" ||
        (item.state === "pending" && (item.loaded || 0) > 0)
      );
    }

    function onGroupDelete(node) {
      if (node.kind === "dl-artist") {
        onDeleteArtist(node.data.artistId, node.title);
      } else if (node.kind === "dl-album") {
        onDeleteAlbum(node.data.albumId, node.title);
      }
    }

    function onLeafDelete(node) {
      if (node.kind === "dl-track") {
        onDeleteTrack(node.data.trackId);
      }
    }

    return {
      downloads,
      roots,
      loading,
      session,
      storageLine,
      queueItems,
      queueSummaryLine,
      showPauseAll,
      showResumeAll,
      codecLabel,
      loadDownloadsChildren,
      closeDownloadsManager,
      onDeleteTrack,
      onGroupDelete,
      onLeafDelete,
      onCancel,
      onRetry,
      onClearFinished,
      onPauseAll,
      onResumeAll,
      progressPct,
      progressKnown,
      progressBytes,
      stateLabel,
      showProgressBar,
      formatBytes,
    };
  },
  template: `
    <div
      id="downloads-modal"
      class="modal downloads-modal"
      :class="{ hidden: !downloads.managerOpen }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="downloads-title"
    >
      <div class="modal-backdrop" @click="closeDownloadsManager"></div>
      <div class="modal-sheet downloads-sheet">
        <div class="modal-head">
          <div class="modal-title" id="downloads-title">Downloads</div>
          <button
            type="button"
            class="icon-btn"
            title="Close"
            aria-label="Close downloads"
            @click="closeDownloadsManager"
          ><Icon name="chevron-down" /></button>
        </div>

        <div class="modal-section">
          <p class="modal-hint">{{ storageLine }}</p>
          <p v-if="downloads.nearQuota" class="modal-hint warn">
            Storage almost full — free space or delete downloads.
          </p>
        </div>

        <div v-if="queueItems.length" class="modal-section">
          <div class="modal-section-title">Queue</div>
          <p v-if="downloads.pauseBanner" class="dl-pause-banner">
            {{ downloads.pauseBanner }}
          </p>
          <p v-if="queueSummaryLine" class="modal-hint dl-queue-summary">
            {{ queueSummaryLine }}
          </p>
          <div class="dl-queue-actions">
            <button
              v-if="showPauseAll"
              type="button"
              class="pill"
              @click="onPauseAll"
            >Pause all</button>
            <button
              v-if="showResumeAll"
              type="button"
              class="pill"
              @click="onResumeAll"
            >Resume all</button>
            <button type="button" class="pill" @click="onClearFinished">
              Clear finished / failed
            </button>
          </div>
          <div class="dl-queue">
            <div v-for="item in queueItems" :key="item.id" class="dl-queue-row">
              <div class="dl-queue-meta">
                <span class="dl-queue-title">{{ item.snapshot?.title || item.trackId }}</span>
                <span class="dl-queue-sub">
                  {{ stateLabel(item) }}
                  <template v-if="progressKnown(item)">
                    · {{ progressPct(item) }}%
                  </template>
                  <template v-if="progressBytes(item)">
                    · {{ progressBytes(item) }}
                  </template>
                  <template v-if="item.error"> · {{ item.error }}</template>
                </span>
                <div
                  v-if="showProgressBar(item)"
                  class="scan-progress-wrap"
                  :class="{ 'is-indeterminate': !progressKnown(item) && item.state === 'active' }"
                >
                  <div
                    class="scan-progress-bar"
                    :style="progressKnown(item) ? { width: progressPct(item) + '%' } : undefined"
                  ></div>
                </div>
              </div>
              <button
                v-if="item.state === 'failed'"
                type="button"
                class="pill"
                @click="onRetry(item.id)"
              >Retry</button>
              <button
                v-if="item.state === 'pending' || item.state === 'active' || item.state === 'failed' || item.state === 'paused'"
                type="button"
                class="icon-btn"
                title="Cancel"
                aria-label="Cancel"
                @click="onCancel(item.id)"
              ><Icon name="trash" /></button>
            </div>
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-section-title">On this device</div>
          <TreeView
            :roots="roots"
            :session="session"
            :load-children="loadDownloadsChildren"
            :loading="loading"
            empty-message="No downloads yet. Use the download button on tracks, albums, or playlists."
          >
            <template #group-actions="{ node }">
              <button
                type="button"
                class="icon-btn"
                :title="node.kind === 'dl-artist' ? 'Delete all from artist' : 'Delete album downloads'"
                :aria-label="node.kind === 'dl-artist' ? 'Delete all from artist' : 'Delete album downloads'"
                @click="onGroupDelete(node)"
              ><Icon name="trash" /></button>
            </template>
            <template #leaf="{ node }">
              <div class="row dl-manager-track">
                <span class="dl-track-num">{{ node.data.trackNum != null ? String(node.data.trackNum).padStart(2,'0') : '—' }}</span>
                <span class="row-meta">
                  <span class="row-title">{{ node.title }}</span>
                  <span class="row-sub">
                    {{ codecLabel(node.data.codec) }}
                    <template v-if="node.data.bytes"> · {{ formatBytes(node.data.bytes) }}</template>
                    <template v-if="node.data.status === 'orphan'"> · removed from library</template>
                    <template v-if="node.data.status === 'broken'"> · file unreadable — re-download</template>
                  </span>
                </span>
                <button
                  type="button"
                  class="icon-btn"
                  title="Delete download"
                  aria-label="Delete download"
                  @click.stop="onLeafDelete(node)"
                ><Icon name="trash" /></button>
              </div>
            </template>
          </TreeView>
        </div>
      </div>
    </div>
  `,
});
