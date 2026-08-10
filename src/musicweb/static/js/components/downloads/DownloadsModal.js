/**
 * Download manager: queue + collapsible artist → album → tracks hierarchy.
 */
import {
  computed,
  defineComponent,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";
import {
  buildDownloadsHierarchy,
  cancelQueueItem,
  clearFinishedQueue,
  closeDownloadsManager,
  downloadsStorageLine,
  formatBytes,
  getLocalArtistImageUrl,
  getLocalCoverUrl,
  pauseAllDownloads,
  removeDownloadedAlbum,
  removeDownloadedArtist,
  removeDownloadedTrack,
  resumeAllDownloads,
  retryQueueItem,
} from "../../downloads/index.js";
import { downloads } from "../../downloads/state.js";
import { settings } from "../../stores/settings.js";
import Icon from "../icons/Icon.js";

export default defineComponent({
  name: "DownloadsModal",
  components: { Icon },
  setup() {
    const hierarchy = ref({ artists: [] });
    const loading = ref(false);
    const artUrls = ref({});
    /** @type {Record<string, boolean>} true = collapsed */
    const collapsedArtists = reactive({});
    /** @type {Record<string, boolean>} true = collapsed */
    const collapsedAlbums = reactive({});

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
        parts.push(`${pct}% · ${formatBytes(s.loadedBytes)} / ${formatBytes(s.totalBytes)}`);
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

    function isArtistCollapsed(id) {
      return !!collapsedArtists[id];
    }

    function isAlbumCollapsed(id) {
      return !!collapsedAlbums[id];
    }

    function toggleArtist(id) {
      collapsedArtists[id] = !collapsedArtists[id];
    }

    function toggleAlbum(id) {
      collapsedAlbums[id] = !collapsedAlbums[id];
    }

    async function loadTree() {
      loading.value = true;
      try {
        hierarchy.value = await buildDownloadsHierarchy();
        const urls = {};
        for (const ar of hierarchy.value.artists) {
          if (ar.hasThumb) {
            const u = await getLocalArtistImageUrl(ar.artistId, "thumb");
            if (u) urls[`a:${ar.artistId}`] = u;
          }
          for (const al of ar.albums) {
            if (al.hasThumb) {
              const u = await getLocalCoverUrl(al.albumId, "thumb");
              if (u) urls[`al:${al.albumId}`] = u;
            }
          }
        }
        artUrls.value = urls;
      } catch (err) {
        console.error(err);
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
      if (!confirm("Remove this download from this device?")) return;
      await removeDownloadedTrack(trackId);
      await loadTree();
    }

    async function onDeleteAlbum(albumId, title) {
      if (!confirm(`Delete all downloaded tracks from “${title}”?`)) return;
      await removeDownloadedAlbum(albumId);
      await loadTree();
    }

    async function onDeleteArtist(artistId, name) {
      if (!confirm(`Delete all downloaded tracks by “${name}”?`)) return;
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

    return {
      downloads,
      hierarchy,
      loading,
      artUrls,
      storageLine,
      queueItems,
      queueSummaryLine,
      showPauseAll,
      showResumeAll,
      codecLabel,
      isArtistCollapsed,
      isAlbumCollapsed,
      toggleArtist,
      toggleAlbum,
      closeDownloadsManager,
      onDeleteTrack,
      onDeleteAlbum,
      onDeleteArtist,
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
          <div v-if="loading" class="list-empty">Loading…</div>
          <div v-else-if="!hierarchy.artists.length" class="list-empty">
            No downloads yet. Use the download button on tracks, albums, or playlists.
          </div>
          <div v-else class="dl-tree">
            <div v-for="artist in hierarchy.artists" :key="artist.artistId" class="dl-artist">
              <div class="dl-artist-head">
                <button
                  type="button"
                  class="dl-tree-toggle"
                  :class="{ collapsed: isArtistCollapsed(artist.artistId) }"
                  :aria-expanded="!isArtistCollapsed(artist.artistId)"
                  :title="isArtistCollapsed(artist.artistId) ? 'Expand' : 'Collapse'"
                  @click="toggleArtist(artist.artistId)"
                >
                  <Icon name="chevron-down" />
                </button>
                <button
                  type="button"
                  class="dl-tree-label"
                  @click="toggleArtist(artist.artistId)"
                >
                  <span class="row-cover-wrap">
                    <img
                      class="row-cover"
                      :src="artUrls['a:' + artist.artistId] || '/static/img/placeholder.svg'"
                      alt=""
                    />
                  </span>
                  <span class="row-meta">
                    <span class="row-title">{{ artist.name }}</span>
                    <span class="row-sub">{{ artist.albums.length }} albums</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  title="Delete all from artist"
                  aria-label="Delete all from artist"
                  @click.stop="onDeleteArtist(artist.artistId, artist.name)"
                ><Icon name="trash" /></button>
              </div>
              <div v-show="!isArtistCollapsed(artist.artistId)">
                <div
                  v-for="album in artist.albums"
                  :key="album.albumId"
                  class="dl-album"
                >
                  <div class="dl-album-head">
                    <button
                      type="button"
                      class="dl-tree-toggle"
                      :class="{ collapsed: isAlbumCollapsed(album.albumId) }"
                      :aria-expanded="!isAlbumCollapsed(album.albumId)"
                      :title="isAlbumCollapsed(album.albumId) ? 'Expand' : 'Collapse'"
                      @click="toggleAlbum(album.albumId)"
                    >
                      <Icon name="chevron-down" />
                    </button>
                    <button
                      type="button"
                      class="dl-tree-label"
                      @click="toggleAlbum(album.albumId)"
                    >
                      <span class="row-cover-wrap">
                        <img
                          class="row-cover"
                          :src="artUrls['al:' + album.albumId] || '/static/img/placeholder.svg'"
                          alt=""
                        />
                      </span>
                      <span class="row-meta">
                        <span class="row-title">{{ album.title }}</span>
                        <span class="row-sub">{{ album.tracks.length }} tracks</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      title="Delete album downloads"
                      aria-label="Delete album downloads"
                      @click.stop="onDeleteAlbum(album.albumId, album.title)"
                    ><Icon name="trash" /></button>
                  </div>
                  <div v-show="!isAlbumCollapsed(album.albumId)">
                    <div
                      v-for="tr in album.tracks"
                      :key="tr.trackId"
                      class="dl-track-row"
                    >
                      <span class="dl-track-num">{{ tr.trackNum != null ? String(tr.trackNum).padStart(2,'0') : '—' }}</span>
                      <span class="row-meta">
                        <span class="row-title">{{ tr.title }}</span>
                        <span class="row-sub">
                          {{ codecLabel(tr.codec) }}
                          <template v-if="tr.bytes"> · {{ formatBytes(tr.bytes) }}</template>
                          <template v-if="tr.status === 'orphan'"> · removed from library</template>
                          <template v-if="tr.status === 'broken'"> · file unreadable — re-download</template>
                        </span>
                      </span>
                      <button
                        type="button"
                        class="icon-btn"
                        title="Delete download"
                        aria-label="Delete download"
                        @click="onDeleteTrack(tr.trackId)"
                      ><Icon name="trash" /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
});
