import { computed, defineComponent, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { coverUrl, fetchPlaylistTracks } from "../../api.js";
import { isLocallyPlayableDownload } from "../../downloads/catalog.js";
import { connectivity } from "../../stores/connectivity.js";
import { isDesktopViewport, useDesktopViewport } from "../../layout.js";
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
import { downloads } from "../../downloads/state.js";
import { downloadTracks } from "../../downloads/ui.js";
import { confirmDialog, promptDialog } from "../../stores/dialog.js";
import { showToast } from "../../stores/ui.js";
import { kindForTrack } from "../../lossyKind.js";
import Icon from "../icons/Icon.js";
import LossyMark from "../lossy/LossyMark.js";
import ActionMenu from "../menu/ActionMenu.js";
import {
  buildQueueMenuItems,
  slotKey,
  slotMatches,
} from "./queueMenuItems.js";

export default defineComponent({
  name: "PlaylistView",
  components: { Icon, ActionMenu, LossyMark },
  setup() {
    const route = useRoute();
    const desktop = useDesktopViewport();
    const saved = ref([]);
    const dropTarget = ref(-1);
    const draggingFrom = ref(-1);
    const menuIndex = ref(-1);
    const menuOpenedKey = ref("");
    const menuAnchor = ref(/** @type {object|null} */ (null));
    const menuRestoreEl = ref(/** @type {HTMLElement|null} */ (null));

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

    function closeMenu() {
      menuIndex.value = -1;
      menuOpenedKey.value = "";
      menuAnchor.value = null;
      menuRestoreEl.value = null;
    }

    const menuSlotMatches = computed(() =>
      slotMatches(menuIndex.value, menuOpenedKey.value)
    );
    const menuOpen = computed(() => menuSlotMatches.value);
    const menuItems = computed(() => {
      if (!menuSlotMatches.value) return [];
      return buildQueueMenuItems({
        track: pl.tracks[menuIndex.value],
        index: menuIndex.value,
        openedKey: menuOpenedKey.value,
      });
    });

    function openMenu(index, anchor, restoreEl) {
      if (pl.editing) return;
      const track = pl.tracks[index];
      if (!track) return;
      menuIndex.value = index;
      menuOpenedKey.value = slotKey(track);
      menuAnchor.value = anchor;
      menuRestoreEl.value = restoreEl || null;
    }

    function onMenuClick(index, e) {
      e.stopPropagation();
      e.preventDefault();
      if (pl.editing) return;
      if (menuOpen.value && menuIndex.value === index) {
        closeMenu();
        return;
      }
      openMenu(index, { kind: "el", el: e.currentTarget }, e.currentTarget);
    }

    function onRowContextMenu(index, e) {
      e.preventDefault();
      if (pl.editing) return;
      if (!isDesktopViewport()) return;
      const btn = e.currentTarget.querySelector(".row-menu");
      openMenu(index, { kind: "point", x: e.clientX, y: e.clientY }, btn);
    }

    function onRowClick(index, e) {
      if (pl.editing) return;
      if (
        e.target.closest(".row-delete") ||
        e.target.closest(".row-drag") ||
        e.target.closest(".row-menu") ||
        e.target.closest(".lossy-mark")
      ) {
        return;
      }
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
      const ok = await confirmDialog({
        title: "Delete playlist",
        message: `Delete playlist “${sp.name}”?`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteSavedPlaylist(sp.id);
        await refreshSaved();
      } catch (err) {
        console.error(err);
        showToast(err.message || "Could not delete playlist");
      }
    }

    async function onSave() {
      try {
        const name = await promptDialog({
          title: "Save playlist",
          message: "Playlist name",
          defaultValue: `Playlist ${new Date().toLocaleDateString()}`,
          confirmLabel: "Save",
        });
        if (!name) return;
        await saveQueueAsPlaylist(name);
        await refreshSaved();
      } catch (err) {
        console.error(err);
        showToast(`Could not save playlist: ${err.message}`);
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
          showToast("Playlist has no downloadable tracks");
          return;
        }
        await downloadTracks(tracks);
      } catch (err) {
        console.error(err);
        showToast(err.message || "Download failed");
      }
    }

    async function onDownloadQueue() {
      if (!downloads.enabled || !pl.tracks.length) return;
      try {
        const tracks = pl.tracks.filter((t) => t.id && !t.isMissing);
        await downloadTracks(tracks);
      } catch (err) {
        console.error(err);
        showToast(err.message || "Download failed");
      }
    }

    function trackCover(track) {
      return coverUrl(track, "thumb", false);
    }

    function rowUnavailable(track) {
      return (
        downloads.enabled &&
        !connectivity.canUseRemote &&
        !isLocallyPlayableDownload(track?.id)
      );
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

    watch(() => route.fullPath, closeMenu);

    watch(
      () => pl.editing,
      (editing) => {
        if (editing) closeMenu();
      }
    );

    watch(menuSlotMatches, (matches) => {
      if (!matches && menuIndex.value >= 0) closeMenu();
    });

    return {
      pl,
      player,
      saved,
      dropTarget,
      draggingFrom,
      desktop,
      menuOpen,
      menuItems,
      menuAnchor,
      menuRestoreEl,
      menuIndex,
      formatTime,
      kindForTrack,
      toggleEdit,
      onClear,
      onRowClick,
      onRowContextMenu,
      onMenuClick,
      closeMenu,
      onDelete,
      onDragStart,
      onLoadSaved,
      onDeleteSaved,
      onSave,
      onDownloadSaved,
      onDownloadQueue,
      trackCover,
      trackSub,
      rowUnavailable,
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
            unavailable: rowUnavailable(track),
            dragging: draggingFrom === index,
            'drop-target': dropTarget === index && draggingFrom !== index,
          }"
          :data-pl-index="index"
          @click="(e) => onRowClick(index, e)"
          @contextmenu="(e) => onRowContextMenu(index, e)"
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
            <span class="row-title-line">
              <span class="row-title">{{ track.title }}</span>
              <LossyMark :kind="kindForTrack(track)" />
            </span>
            <span class="row-sub">{{ trackSub(track) }}</span>
          </span>
          <span class="row-dur">{{ formatTime(track.duration) }}</span>
          <button
            type="button"
            class="icon-btn row-menu"
            title="Track actions"
            aria-label="Track actions"
            :aria-haspopup="desktop ? 'menu' : 'dialog'"
            :aria-expanded="menuOpen && menuIndex === index ? 'true' : 'false'"
            @click="(e) => onMenuClick(index, e)"
          ><Icon name="more-vert" /></button>
          <span
            class="row-drag"
            title="Drag to reorder"
            aria-label="Drag to reorder"
            @pointerdown="(e) => onDragStart(e, index)"
          ><Icon name="drag" /></span>
        </div>
      </div>
      <ActionMenu
        :open="menuOpen"
        :items="menuItems"
        :anchor="menuAnchor"
        :restore-el="menuRestoreEl"
        @close="closeMenu"
      />
    </section>
  `,
});
