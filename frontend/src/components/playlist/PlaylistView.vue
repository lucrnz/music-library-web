<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { coverUrl, fetchPlaylistTracks } from "@/api";
import { isOfflineUnplayable } from "@/playBlock";
import { connectivity } from "@/stores/connectivity";
import { useDesktopViewport } from "@/layout";
import { formatTime } from "@/util";
import {
  pl,
  clearPlaylist,
  removeIndices,
  reorderPlaylist,
  fetchSavedPlaylists,
  loadSavedPlaylist,
  deleteSavedPlaylist,
  saveQueueAsPlaylist,
  type SavedPlaylist,
} from "@/stores/playlist";
import {
  player,
  playIndex,
  stopPlayback,
} from "@/stores/player";
import { toggleRadioRail } from "@/stores/playerPrefs";
import { toggleCdSession } from "@/stores/cd";
import { activeSession } from "@/playback/session";
import { canShowCdUi } from "@/exclusive/capability";
import { downloads } from "@/downloads/state";
import { downloadTracks } from "@/downloads/ui";
import { confirmDialog, promptDialog } from "@/stores/dialog";
import { showToast } from "@/stores/ui";
import { kindForTrack } from "@/lossyKind";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import ActionMenu from "@/components/menu/ActionMenu.vue";
import { isDesktopContextMenu } from "@/components/menu/rowActionMenu";
import { useRowActionMenu } from "@/components/menu/useRowActionMenu";
import {
  buildQueueMenuItems,
  slotKey,
  slotMatches,
} from "@/components/playlist/queueMenuItems";
import type { MenuAnchor } from "@/components/menu/actionItem";
import type { Track } from "@/models/track";

const route = useRoute();
    const desktop = useDesktopViewport();
    const saved = ref<SavedPlaylist[]>([]);
    const dropTarget = ref(-1);
    const draggingFrom = ref(-1);
    const menuIndex = ref(-1);
    const menuOpenedKey = ref("");
    const { menuAnchor, menuRestoreEl, closeMenu: closeMenuChrome, openMenu: openMenuChrome } =
      useRowActionMenu();

    async function refreshSaved() {
      try {
        saved.value = await fetchSavedPlaylists();
      } catch (err: unknown) {
        console.error(err);
      }
    }

    const showCdButton = computed(() => canShowCdUi());

    function toggleEdit() {
      pl.editing = !pl.editing;
    }

    function onClear() {
      clearPlaylist(stopPlayback);
    }

    function closeMenu() {
      menuIndex.value = -1;
      menuOpenedKey.value = "";
      closeMenuChrome();
    }

    const menuSlotMatches = computed(() =>
      slotMatches(menuIndex.value, menuOpenedKey.value)
    );
    const menuOpen = computed(() => menuSlotMatches.value);
    const menuItems = computed(() => {
      if (!menuSlotMatches.value) return [];
      const track = pl.tracks[menuIndex.value];
      if (!track) return [];
      return buildQueueMenuItems({
        track,
        index: menuIndex.value,
        openedKey: menuOpenedKey.value,
      });
    });

    function openMenu(index: number, anchor: MenuAnchor, restoreEl?: HTMLElement | null) {
      if (pl.editing) return;
      const track = pl.tracks[index];
      if (!track) return;
      menuIndex.value = index;
      menuOpenedKey.value = slotKey(track);
      openMenuChrome(anchor, restoreEl);
    }

    function onMenuClick(index: number, e: MouseEvent) {
      e.stopPropagation();
      e.preventDefault();
      if (pl.editing) return;
      if (menuOpen.value && menuIndex.value === index) {
        closeMenu();
        return;
      }
      const el = e.currentTarget;
      if (!(el instanceof HTMLElement)) return;
      openMenu(index, { kind: "el", el }, el);
    }

    function onRowContextMenu(index: number, e: MouseEvent) {
      e.preventDefault();
      if (pl.editing) return;
      if (!isDesktopContextMenu()) return;
      const current = e.currentTarget;
      if (!(current instanceof HTMLElement)) return;
      const btn = current.querySelector(".row-menu");
      openMenu(
        index,
        { kind: "point", x: e.clientX, y: e.clientY },
        btn instanceof HTMLElement ? btn : null,
      );
    }

    function onRowClick(index: number, e: MouseEvent) {
      if (pl.editing) return;
      if (
        e.target instanceof Element &&
        (e.target.closest(".row-delete") ||
        e.target.closest(".row-drag") ||
        e.target.closest(".row-menu") ||
        e.target.closest(".lossy-mark"))
      ) {
        return;
      }
      playIndex(index);
    }

    function onDelete(index: number) {
      const { removedCurrent, nextIndex } = removeIndices([index]);
      if (removedCurrent) {
        if (pl.length && nextIndex >= 0) playIndex(nextIndex);
        else stopPlayback();
      }
    }

    function onDragStart(e: PointerEvent, index: number) {
      e.preventDefault();
      draggingFrom.value = index;
      let targetIndex = index;

      const onMove = (ev: PointerEvent) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const over = el ? el.closest(".row[data-pl-index]") : null;
        if (over) {
          targetIndex = Number(over instanceof HTMLElement ? over.dataset.plIndex : -1);
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

    async function onLoadSaved(sp: SavedPlaylist) {
      try {
        await loadSavedPlaylist(sp.id, stopPlayback);
        await refreshSaved();
      } catch (err: unknown) {
        console.error(err);
      }
    }

    async function onDeleteSaved(sp: SavedPlaylist, e: MouseEvent) {
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
      } catch (err: unknown) {
        console.error(err);
        showToast(err instanceof Error ? err.message : "Could not delete playlist");
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
      } catch (err: unknown) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Could not save playlist: ${msg}`);
      }
    }

    async function onDownloadSaved(sp: SavedPlaylist, e: MouseEvent) {
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
      } catch (err: unknown) {
        console.error(err);
        showToast(err instanceof Error ? err.message : "Download failed");
      }
    }

    async function onDownloadQueue() {
      if (!downloads.enabled || !pl.tracks.length) return;
      try {
        const tracks = pl.tracks.filter((t) => t.id && !t.isMissing);
        await downloadTracks(tracks);
      } catch (err: unknown) {
        console.error(err);
        showToast(err instanceof Error ? err.message : "Download failed");
      }
    }

    function trackCover(track: Track) {
      return coverUrl(track, "thumb", false);
    }

    function rowUnavailable(track: Track | null | undefined) {
      return isOfflineUnplayable(track?.id, {
        downloadsEnabled: downloads.enabled,
        canUseRemote: connectivity.canUseRemote,
      });
    }

    function trackSub(track: Track) {
      return [track.artist, track.album].filter(Boolean).join(" - ");
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
</script>

<template>
    <section id="view-playlist" class="view" aria-label="Playlist">
      <div class="view-bar">
        <div class="view-title">Queue</div>
        <div class="view-actions">
          <button
            v-if="desktop"
            type="button"
            class="icon-btn"
            title="Radio"
            aria-label="Radio"
            :aria-pressed="player.expanded && player.railFace === 'radio' ? 'true' : 'false'"
            @click="toggleRadioRail"
          ><Icon name="radio" /></button>
          <button
            v-if="desktop && showCdButton"
            type="button"
            class="icon-btn"
            title="CD"
            aria-label="CD"
            :aria-pressed="activeSession() === 'cd' ? 'true' : 'false'"
            @click="toggleCdSession"
          ><Icon name="cd" /></button>
          <button
            v-if="downloads.enabled && pl.length"
            type="button"
            class="pill"
            title="Download queue"
            aria-label="Download queue"
            @click="onDownloadQueue"
          ><Icon name="download" /><span>Download</span></button>
          <button
            type="button"
            class="pill"
            title="Save queue as playlist"
            aria-label="Save queue as playlist"
            @click="onSave"
          ><Icon name="save" /><span>Save</span></button>
          <button
            v-if="pl.editing && pl.length"
            type="button"
            class="pill danger"
            aria-label="Clear all"
            @click="onClear"
          ><Icon name="trash" /><span>Clear all</span></button>
          <button
            type="button"
            class="pill"
            :aria-label="pl.editing ? 'Done' : 'Edit'"
            @click="toggleEdit"
          >
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
            <span class="saved-pl-count">{{ sp.trackCount }} tracks</span>
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
        <div v-if="!pl.tracks.length" class="list-empty">
          {{ pl.editing
            ? 'Playlist is empty'
            : 'Playlist empty - tap tracks in the Library to add them' }}
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
</template>
