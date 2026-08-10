import { defineComponent, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { coverUrl, fetchPlaylistTracks } from "../../api.js";
import { formatTime } from "../../util.js";
import {
  pl,
  clearPlaylist,
  removeIndices,
  reorderPlaylist,
  fetchSavedPlaylists,
  loadSavedPlaylist,
  deleteSavedPlaylist,
  saveQueueAsPlaylist,
} from "../../stores/playlist.js";
import {
  player,
  playIndex,
  stopPlayback,
} from "../../stores/player.js";
import {
  downloadTracks,
  refreshDownloadStatuses,
} from "../../downloads/index.js";
import { downloads } from "../../downloads/state.js";
import Icon from "../icons/Icon.js";

export default defineComponent({
  name: "PlaylistView",
  components: { Icon },
  setup() {
    const route = useRoute();
    const saved = ref([]);
    const dropTarget = ref(-1);
    const draggingFrom = ref(-1);

    async function refreshSaved() {
      try {
        saved.value = await fetchSavedPlaylists();
      } catch (err) {
        console.error(err);
      }
    }

    function toggleEdit() {
      pl.editing = !pl.editing;
    }

    function onClear() {
      clearPlaylist(stopPlayback);
    }

    function onRowClick(index, e) {
      if (pl.editing) return;
      if (e.target.closest(".row-delete") || e.target.closest(".row-drag")) return;
      playIndex(index);
    }

    function onDelete(index) {
      removeIndices([index], playIndex, stopPlayback);
    }

    function onDragStart(e, index) {
      e.preventDefault();
      draggingFrom.value = index;
      let targetIndex = index;

      const onMove = (ev) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const over = el ? el.closest(".row[data-pl-index]") : null;
        if (over) {
          targetIndex = Number(over.dataset.plIndex);
          dropTarget.value = targetIndex;
        }
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        draggingFrom.value = -1;
        dropTarget.value = -1;
        if (targetIndex !== index) reorderPlaylist(index, targetIndex);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }

    async function onLoadSaved(sp) {
      try {
        await loadSavedPlaylist(sp.id, stopPlayback);
        await refreshSaved();
      } catch (err) {
        console.error(err);
      }
    }

    async function onDeleteSaved(sp, e) {
      e.stopPropagation();
      if (!confirm(`Delete playlist “${sp.name}”?`)) return;
      try {
        await deleteSavedPlaylist(sp.id);
        await refreshSaved();
      } catch (err) {
        console.error(err);
      }
    }

    async function onSave() {
      try {
        const name = prompt(
          "Playlist name",
          `Playlist ${new Date().toLocaleDateString()}`
        );
        if (!name || !name.trim()) return;
        await saveQueueAsPlaylist(name);
        await refreshSaved();
      } catch (err) {
        console.error(err);
        alert(`Could not save playlist: ${err.message}`);
      }
    }

    async function onDownloadSaved(sp, e) {
      e.stopPropagation();
      if (!downloads.enabled) return;
      try {
        const tracks = (await fetchPlaylistTracks(sp.id)).filter(
          (t) => t.id && !t.isMissing
        );
        if (!tracks.length) {
          alert("Playlist has no downloadable tracks");
          return;
        }
        await downloadTracks(tracks);
        await refreshDownloadStatuses();
      } catch (err) {
        console.error(err);
        alert(err.message || "Download failed");
      }
    }

    async function onDownloadQueue() {
      if (!downloads.enabled || !pl.tracks.length) return;
      try {
        const tracks = pl.tracks.filter((t) => t.id && !t.isMissing);
        await downloadTracks(tracks);
        await refreshDownloadStatuses();
      } catch (err) {
        console.error(err);
        alert(err.message || "Download failed");
      }
    }

    function trackCover(track) {
      return coverUrl(track, "thumb", false);
    }

    function trackSub(track) {
      return [track.artist, track.album].filter(Boolean).join(" — ");
    }

    onMounted(refreshSaved);

    watch(
      () => route.meta.pane,
      (pane) => {
        if (pane === "queue") refreshSaved();
      }
    );

    return {
      pl,
      player,
      saved,
      dropTarget,
      draggingFrom,
      formatTime,
      toggleEdit,
      onClear,
      onRowClick,
      onDelete,
      onDragStart,
      onLoadSaved,
      onDeleteSaved,
      onSave,
      onDownloadSaved,
      onDownloadQueue,
      trackCover,
      trackSub,
      refreshSaved,
      downloads,
    };
  },
  template: `
    <section id="view-playlist" class="view" aria-label="Playlist">
      <div class="view-bar">
        <div class="view-title">Queue</div>
        <div class="view-actions">
          <button
            v-if="downloads.enabled && pl.length"
            type="button"
            class="pill"
            title="Download queue"
            @click="onDownloadQueue"
          ><Icon name="download" /><span>Download</span></button>
          <button type="button" class="pill" title="Save queue as playlist" @click="onSave">Save</button>
          <button
            v-if="pl.editing && pl.length"
            type="button"
            class="pill danger"
            @click="onClear"
          >Clear all</button>
          <button type="button" class="pill" @click="toggleEdit">
            <Icon name="edit" /><span>{{ pl.editing ? 'Done' : 'Edit' }}</span>
          </button>
        </div>
      </div>

      <div class="saved-pl-list">
        <div v-if="!saved.length" class="saved-pl-hint">
          Saved playlists appear here (shared on the LAN).
        </div>
        <div v-for="sp in saved" :key="sp.id" class="saved-pl-row">
          <button type="button" class="saved-pl-load" @click="onLoadSaved(sp)">
            <span class="saved-pl-name">{{ sp.name }}</span>
            <span class="saved-pl-count">{{ sp.track_count }} tracks</span>
          </button>
          <button
            v-if="downloads.enabled"
            type="button"
            class="icon-btn"
            title="Download playlist"
            aria-label="Download playlist"
            @click="(e) => onDownloadSaved(sp, e)"
          ><Icon name="download" /></button>
          <button
            type="button"
            class="icon-btn saved-pl-del"
            title="Delete playlist"
            aria-label="Delete playlist"
            @click="(e) => onDeleteSaved(sp, e)"
          ><Icon name="trash" /></button>
        </div>
      </div>

      <div class="row-list" :class="{ editing: pl.editing }">
        <div v-if="!pl.length" class="list-empty">
          {{ pl.editing
            ? 'Playlist is empty'
            : 'Playlist empty — tap tracks in the Library to add them' }}
        </div>
        <div
          v-for="(track, index) in pl.tracks"
          :key="(track.id || track.path || index) + '-' + index"
          class="row"
          :class="{
            playing: index === pl.index,
            dragging: draggingFrom === index,
            'drop-target': dropTarget === index && draggingFrom !== index,
          }"
          :data-pl-index="index"
          @click="(e) => onRowClick(index, e)"
        >
          <button
            type="button"
            class="icon-btn row-delete"
            title="Remove"
            aria-label="Remove from playlist"
            @click.stop="onDelete(index)"
          ><Icon name="trash" /></button>
          <span class="row-cover-wrap">
            <img class="row-cover" :src="trackCover(track)" alt="" loading="lazy" />
            <span
              v-if="index === pl.index"
              class="eq"
              :class="{ paused: player.paused }"
            ><span></span><span></span><span></span></span>
          </span>
          <span class="row-meta">
            <span class="row-title">{{ track.title }}</span>
            <span class="row-sub">{{ trackSub(track) }}</span>
          </span>
          <span class="row-dur">{{ formatTime(track.duration) }}</span>
          <span
            class="row-drag"
            title="Drag to reorder"
            aria-label="Drag to reorder"
            @pointerdown="(e) => onDragStart(e, index)"
          ><Icon name="drag" /></span>
        </div>
      </div>
    </section>
  `,
});
