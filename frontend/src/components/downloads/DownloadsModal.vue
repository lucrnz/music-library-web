<script setup lang="ts">
/**
 * Download manager: queue + collapsible artist → album → tracks hierarchy.
 */
import { computed, onUnmounted, ref, watch } from "vue";
import {
  cancelQueueItem,
  clearFinishedQueue,
  closeDownloadsManager,
  downloadsStorageLine,
  pauseAllDownloads,
  removeDownloadedAlbum,
  removeDownloadedArtist,
  resumeAllDownloads,
  retryQueueItem,
} from "@/downloads/index";
import { downloads } from "@/downloads/state";
import { formatBytes } from "@/downloads/storageInfo";
import { confirmRemoveDownloadedTrack } from "@/downloads/ui";
import { confirmDialog } from "@/stores/dialog";
import { settings } from "@/stores/settings";
import Icon from "@/components/icons/Icon.vue";
import {
  loadDownloadsChildren,
  loadDownloadsTree,
} from "@/components/tree/sources/downloadsSource";
import TreeView from "@/components/tree/TreeView.vue";
import { createTreeSession, primePackedTree } from "@/components/tree/treeSession";
import type { TreeNode } from "@/components/tree/treeNode";

interface QueueItem {
  id: number;
  trackId?: string;
  state?: string;
  error?: string;
  loaded?: number;
  total?: number | null;
  snapshot?: { title?: string };
}

const roots = ref<TreeNode[]>([]);
    const loading = ref(false);
    const session = createTreeSession();

    const storageLine = computed(() => downloadsStorageLine("long"));

    const queueItems = computed(
      () => (downloads.queue || []) as QueueItem[],
    );

    const queueSummaryLine = computed(() => {
      const s = downloads.queueSummary;
      if (!s.total) return "";
      const parts: string[] = [];
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

    function codecLabel(codec: string | undefined) {
      const opt = settings.options.find((o) => o.id === codec);
      return opt?.label || codec || "—";
    }

    async function loadTree() {
      loading.value = true;
      try {
        const packed = await loadDownloadsTree();
        session.collapseAll();
        primePackedTree(session, packed.roots);
        roots.value = packed.roots;
      } catch (err: unknown) {
        console.error(err);
        roots.value = [];
      } finally {
        loading.value = false;
      }
    }

    function onKey(e: KeyboardEvent) {
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

    async function onDeleteTrack(trackId: string) {
      if (!(await confirmRemoveDownloadedTrack(trackId))) return;
      await loadTree();
    }

    async function onDeleteAlbum(albumId: string, title: string) {
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

    async function onDeleteArtist(artistId: string, name: string) {
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

    async function onCancel(id: number) {
      await cancelQueueItem(id);
    }

    async function onRetry(id: number) {
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

    function progressPct(item: QueueItem) {
      if (!item.total || !item.loaded) return 0;
      return Math.min(100, Math.round((item.loaded / item.total) * 100));
    }

    function progressKnown(item: QueueItem) {
      return !!(item.total && item.total > 0);
    }

    function progressBytes(item: QueueItem) {
      const loaded = item.loaded || 0;
      if (progressKnown(item) && item.total) {
        return `${formatBytes(loaded)} / ${formatBytes(item.total)}`;
      }
      if (loaded > 0) return formatBytes(loaded);
      return "";
    }

    function stateLabel(item: QueueItem) {
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

    function showProgressBar(item: QueueItem) {
      return (
        item.state === "active" ||
        item.state === "paused" ||
        (item.state === "pending" && (item.loaded || 0) > 0)
      );
    }

    type DownloadLeaf = {
      id?: string;
      track?: number | null;
      codec?: string;
      bytes?: number | null;
      status?: string;
    };

    function leaf(node: TreeNode): DownloadLeaf {
      if (node.kind === "track") {
        return {
          id: node.data.id,
          track: node.data.track,
          codec: node.data.codec,
          bytes: node.data.bytes,
          status: node.data.status,
        };
      }
      if (node.kind === "artist" || node.kind === "album") {
        return { id: node.data.id };
      }
      return {};
    }

    function onGroupDelete(node: TreeNode) {
      const id = leaf(node).id || "";
      if (node.kind === "artist") {
        onDeleteArtist(id, node.title);
      } else if (node.kind === "album") {
        onDeleteAlbum(id, node.title);
      }
    }

    function onLeafDelete(node: TreeNode) {
      if (node.kind === "track") {
        onDeleteTrack(leaf(node).id || "");
      }
    }

    function leafTrackNum(node: TreeNode) {
      return leaf(node).track ?? null;
    }
    function leafCodec(node: TreeNode) {
      return leaf(node).codec || "";
    }
    function leafBytes(node: TreeNode) {
      return leaf(node).bytes ?? null;
    }
    function leafStatus(node: TreeNode) {
      return leaf(node).status || "";
    }
</script>

<template>
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
          ><Icon name="close" /></button>
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
                :title="node.kind === 'artist' ? 'Delete all from artist' : 'Delete album downloads'"
                :aria-label="node.kind === 'artist' ? 'Delete all from artist' : 'Delete album downloads'"
                @click="onGroupDelete(node)"
              ><Icon name="trash" /></button>
            </template>
            <template #leaf="{ node }">
              <div class="row dl-manager-track">
                <span class="downloads-track-num">{{ leafTrackNum(node) != null ? String(leafTrackNum(node)).padStart(2,'0') : '—' }}</span>
                <span class="row-meta">
                  <span class="row-title">{{ node.title }}</span>
                  <span class="row-sub">
                    {{ codecLabel(leafCodec(node)) }}
                    <template v-if="leafBytes(node)"> · {{ formatBytes(leafBytes(node) || 0) }}</template>
                    <template v-if="leafStatus(node) === 'orphan'"> · removed from library</template>
                    <template v-if="leafStatus(node) === 'broken'"> · file unreadable — re-download</template>
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
</template>
