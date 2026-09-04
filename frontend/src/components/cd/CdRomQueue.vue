<script setup lang="ts">
import { computed, ref } from "vue";
import { cdromCoverUrl } from "@/cd/cdrom";
import { cdromClear, cdromRemoveAt, cdromReorder } from "@/cd/cdromQueue";
import { cd, cdEntryAllowed, toggleCdSession } from "@/stores/cd";
import { cdLoad } from "@/playback/cdLoad";
import { player } from "@/stores/playerState";
import { toggleRadioRail } from "@/stores/playerPrefs";
import { activeSession } from "@/playback/session";
import { useDesktopViewport } from "@/layout";
import { formatTime } from "@/util";
import { kindForTrack } from "@/lossyKind";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import ActionMenu from "@/components/menu/ActionMenu.vue";
import { isDesktopContextMenu } from "@/components/menu/rowActionMenu";
import { useRowActionMenu } from "@/components/menu/useRowActionMenu";
import { buildCdromQueueMenuItems } from "@/components/cd/cdromMenuItems";
import type { ActionItem } from "@/components/menu/actionItem";

const desktop = useDesktopViewport();
const editing = ref(false);
const draggingFrom = ref(-1);
const dropTarget = ref(-1);
const menuIndex = ref(-1);
const { menuAnchor, menuRestoreEl, closeMenu: closeMenuChrome, openMenu } =
  useRowActionMenu();

const showChrome = computed(() => desktop.value && cdEntryAllowed());
const emptyCopy = "Add some files to start CD playback";

const menuItems = computed((): ActionItem[] => {
  if (menuIndex.value < 0) return [];
  const index = menuIndex.value;
  return buildCdromQueueMenuItems({
    remove: () => cdromRemoveAt(index),
  });
});

function toggleEdit() {
  editing.value = !editing.value;
}

function onClear() {
  cdromClear();
}

function onRowClick(index: number) {
  if (editing.value) return;
  void cdLoad(index);
}

function closeMenu() {
  menuIndex.value = -1;
  closeMenuChrome();
}

function openRowMenu(index: number, e: MouseEvent) {
  menuIndex.value = index;
  const el = e.currentTarget;
  if (el instanceof HTMLElement) openMenu({ kind: "el", el }, el);
  else openMenu({ kind: "point", x: e.clientX, y: e.clientY }, null);
}

function onRowContext(index: number, e: MouseEvent) {
  if (!isDesktopContextMenu()) return;
  e.preventDefault();
  openRowMenu(index, e);
}

function onDragStart(e: PointerEvent, index: number) {
  if (!editing.value) return;
  e.preventDefault();
  draggingFrom.value = index;
  let targetIndex = index;

  const onMove = (ev: PointerEvent) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const over = el ? el.closest(".row[data-cdrom-index]") : null;
    if (over instanceof HTMLElement) {
      targetIndex = Number(over.dataset.cdromIndex);
      dropTarget.value = targetIndex;
    }
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    draggingFrom.value = -1;
    dropTarget.value = -1;
    if (targetIndex !== index) cdromReorder(index, targetIndex);
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}
</script>

<template>
  <section class="cdrom-queue" aria-label="CD queue">
    <div class="view-bar">
      <div class="view-title">Queue</div>
      <div class="view-actions">
        <button
          v-if="showChrome"
          type="button"
          class="icon-btn"
          title="Radio"
          aria-label="Radio"
          :aria-pressed="player.expanded && player.railFace === 'radio' ? 'true' : 'false'"
          @click="toggleRadioRail"
        ><Icon name="radio" /></button>
        <button
          v-if="showChrome"
          type="button"
          class="icon-btn"
          title="CD"
          aria-label="CD"
          :aria-pressed="activeSession() === 'cd' ? 'true' : 'false'"
          @click="toggleCdSession"
        ><Icon name="cd" /></button>
        <button
          v-if="editing && cd.tracks.length"
          type="button"
          class="pill danger"
          aria-label="Clear all"
          @click="onClear"
        ><Icon name="trash" /><span>Clear</span></button>
        <button
          type="button"
          class="pill"
          :aria-label="editing ? 'Done' : 'Edit'"
          @click="toggleEdit"
        >
          <Icon name="edit" /><span>{{ editing ? "Done" : "Edit" }}</span>
        </button>
      </div>
    </div>
    <div class="row-list" :class="{ editing }">
      <div v-if="!cd.tracks.length" class="list-empty">{{ emptyCopy }}</div>
      <div
        v-for="(track, index) in cd.tracks"
        :key="(track.id || index) + '-' + index"
        class="row"
        :data-cdrom-index="index"
        :class="{
          playing: index === cd.index,
          dragging: draggingFrom === index,
          'drop-target': dropTarget === index && draggingFrom !== index,
        }"
        @click="onRowClick(index)"
        @contextmenu="onRowContext(index, $event)"
      >
        <button
          v-if="editing"
          type="button"
          class="icon-btn row-delete"
          title="Remove"
          aria-label="Remove"
          @click.stop="cdromRemoveAt(index)"
        ><Icon name="trash" /></button>
        <span class="row-cover-wrap">
          <img class="row-cover" :src="cdromCoverUrl(track)" alt="" loading="lazy" />
          <span
            v-if="index === cd.index"
            class="eq"
            :class="{ paused: player.paused }"
          ><span></span><span></span><span></span></span>
        </span>
        <span class="row-meta">
          <span class="row-title-line">
            <span class="row-title">{{ track.title }}</span>
            <LossyMark :kind="kindForTrack(track)" />
          </span>
          <span class="row-sub">{{ [track.artist, track.album].filter(Boolean).join(" - ") }}</span>
        </span>
        <span class="row-dur">{{ formatTime(track.duration) }}</span>
        <button
          type="button"
          class="icon-btn row-menu"
          title="Track actions"
          aria-label="Track actions"
          @click.stop="openRowMenu(index, $event)"
        ><Icon name="more-vert" /></button>
        <span
          v-if="editing"
          class="row-drag"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          @pointerdown="(e) => onDragStart(e, index)"
        ><Icon name="drag" /></span>
      </div>
    </div>
    <ActionMenu
      :open="menuIndex >= 0 && !!menuAnchor"
      :items="menuItems"
      :anchor="menuAnchor"
      :restore-el="menuRestoreEl"
      @close="closeMenu"
    />
  </section>
</template>
