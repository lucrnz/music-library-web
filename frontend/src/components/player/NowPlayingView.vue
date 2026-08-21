<script setup lang="ts">
/**
 * Presentational now-playing surface. Transport is a slot.
 * Does not import player.ts or radio.ts.
 */
import { computed, nextTick, ref, watch, type Ref } from "vue";
import { canReachServer } from "@/connectivity";
import { copyText } from "@/clipboard";
import type { ExclusiveFaceSnapshot } from "@/exclusive/statusFace";
import { peekLyricsMemory, resolveLyrics } from "@/lyrics/cache";
import { lyricsClipboardText } from "@/lyrics/plainText";
import { kindForTrack } from "@/lossyKind";
import type { Track } from "@/models/track";
import type { PlayStatusState } from "@/playbackStatus";
import { openSettings } from "@/stores/settings";
import { showToast } from "@/stores/ui";
import { formatTime, setRangeFill } from "@/util";
import ActionMenu from "@/components/menu/ActionMenu.vue";
import { useRowActionMenu } from "@/components/menu/useRowActionMenu";
import { useDesktopViewport } from "@/layout";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import LyricsOverlay from "@/components/player/LyricsOverlay.vue";
import { buildNowPlayingMenuItems } from "@/components/player/nowPlayingMenuItems";
import PlaybackStatusLine from "@/components/player/PlaybackStatusLine.vue";

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    coverFull?: string;
    closeIcon?: string;
    npModal?: boolean;
    expanded?: boolean;
    seekValue?: number;
    currentTime?: number;
    duration?: number;
    volume?: number;
    track?: Track | null;
    trackId?: string | null;
    seekInteractive?: boolean;
    lyricsOpen?: boolean;
    lyricsSeekable?: boolean;
    showClose?: boolean;
    showStatus?: boolean;
    reserveStatus?: boolean;
    showLyricsToggle?: boolean;
    showMenu?: boolean;
    sheetDismissible?: boolean;
    openLabel?: string;
    playState: PlayStatusState;
    exclusiveSnap: ExclusiveFaceSnapshot | null;
  }>(),
  {
    title: "—",
    subtitle: "",
    coverFull: "",
    closeIcon: "close",
    npModal: false,
    expanded: false,
    seekValue: 0,
    currentTime: 0,
    duration: 0,
    volume: 1,
    track: null,
    trackId: null,
    seekInteractive: true,
    lyricsOpen: false,
    lyricsSeekable: true,
    showClose: true,
    showStatus: false,
    reserveStatus: false,
    showLyricsToggle: false,
    showMenu: false,
    sheetDismissible: false,
    openLabel: "Open now playing",
  },
);

const emit = defineEmits<{
  collapse: [];
  "cover-or-meta-open": [ev?: MouseEvent | KeyboardEvent];
  "seek-fraction": [fraction: number];
  "seek-dragging": [dragging: boolean];
  volume: [value: number];
  "toggle-lyrics": [];
  "sheet-drag-start": [clientY: number];
  "sheet-drag-move": [clientY: number];
  "sheet-drag-end": [dy: number];
}>();

export type NowPlayingViewExpose = {
  focusClose: () => void;
  closeBtn: Ref<HTMLButtonElement | null>;
};

const seekEl = ref<HTMLInputElement | null>(null);
const volEl = ref<HTMLInputElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
const sheetDragY = ref<number | null>(null);
const seeking = ref(false);

const lossyKind = computed(() => kindForTrack(props.track));
const desktop = useDesktopViewport();
const {
  menuAnchor,
  menuRestoreEl,
  closeMenu,
  openMenu,
} = useRowActionMenu();
const menuOpen = computed(() => !!menuAnchor.value);
const offerCopyLyrics = ref(true);

function collapse() {
  emit("collapse");
}

function onCoverOrMetaOpen(ev?: MouseEvent | KeyboardEvent) {
  emit("cover-or-meta-open", ev);
}

function onSheetDown(e: PointerEvent) {
  if (!props.sheetDismissible || desktop.value) return;
  sheetDragY.value = e.clientY;
  const target = e.currentTarget;
  if (target instanceof HTMLElement) {
    target.setPointerCapture?.(e.pointerId);
  }
  emit("sheet-drag-start", e.clientY);
}

function onSheetMove(e: PointerEvent) {
  if (sheetDragY.value == null) return;
  emit("sheet-drag-move", e.clientY);
}

function onSheetUp(e: PointerEvent) {
  if (sheetDragY.value == null) return;
  const dy = e.clientY - sheetDragY.value;
  sheetDragY.value = null;
  emit("sheet-drag-end", dy);
}

function rangeTarget(e: Event): HTMLInputElement | null {
  return e.target instanceof HTMLInputElement ? e.target : null;
}

function onSeekDown() {
  if (!props.seekInteractive) return;
  seeking.value = true;
  emit("seek-dragging", true);
}

function onSeekUp(e: Event) {
  if (!props.seekInteractive) return;
  seeking.value = false;
  emit("seek-dragging", false);
  const el = rangeTarget(e);
  if (!el) return;
  emit("seek-fraction", Number(el.value) / 1000);
}

function onSeekInput(e: Event) {
  const el = rangeTarget(e);
  if (el) setRangeFill(el);
}

function onVolInput(e: Event) {
  const el = rangeTarget(e);
  if (!el) return;
  emit("volume", Number(el.value));
  setRangeFill(el);
}

watch(
  () => [props.seekValue, props.currentTime, props.duration, seeking.value] as const,
  async () => {
    await nextTick();
    if (!seeking.value && seekEl.value) {
      seekEl.value.value = String(props.seekValue);
      setRangeFill(seekEl.value);
    }
  },
);

watch(
  () => props.volume,
  async () => {
    await nextTick();
    if (volEl.value) {
      volEl.value.value = String(props.volume);
      setRangeFill(volEl.value);
    }
  },
  { immediate: true },
);

function focusClose() {
  nextTick(() => {
    closeBtn.value?.focus?.();
  });
}

function refreshLyricsOffer() {
  const id = props.trackId;
  if (!id) {
    offerCopyLyrics.value = false;
    return;
  }
  const peek = peekLyricsMemory(id);
  offerCopyLyrics.value = !(peek && lyricsClipboardText(peek) == null);
}

async function copyLyrics() {
  const id = props.trackId;
  if (!id) return;
  const payload = await resolveLyrics(id, {
    allowNetwork: canReachServer(),
  });
  if (props.trackId !== id) return;
  const text = lyricsClipboardText(payload);
  if (!text) {
    showToast("No lyrics to copy");
    return;
  }
  await copyText(text);
}

const menuItems = computed(() => {
  const track = props.track;
  if (!track) return [];
  return buildNowPlayingMenuItems({
    track,
    offerCopyLyrics: offerCopyLyrics.value,
    copyLyrics,
  });
});

function onNowPlayingMenuClick(e: MouseEvent) {
  const el = e.currentTarget;
  if (!(el instanceof HTMLElement)) return;
  if (menuOpen.value) {
    closeMenu();
    return;
  }
  refreshLyricsOffer();
  openMenu({ kind: "el", el }, el);
}

watch(
  () => [props.expanded, props.trackId] as const,
  () => closeMenu(),
);

defineExpose({ focusClose, closeBtn });
</script>

<template>
  <div
    class="player-full"
    :role="npModal ? 'dialog' : expanded ? 'complementary' : undefined"
    :aria-modal="npModal ? 'true' : undefined"
    :aria-label="expanded ? 'Now playing' : undefined"
  >
    <div
      class="sheet-grab"
      @pointerdown="onSheetDown"
      @pointermove="onSheetMove"
      @pointerup="onSheetUp"
    >
      <button
        v-if="showClose"
        type="button"
        ref="closeBtn"
        class="icon-btn"
        title="Close"
        aria-label="Close now playing"
        @click="collapse"
      >
        <Icon :name="closeIcon" />
      </button>
      <button
        v-if="showMenu && track"
        type="button"
        class="icon-btn row-menu"
        title="Now playing actions"
        aria-label="Now playing actions"
        :aria-haspopup="desktop ? 'menu' : 'dialog'"
        @click="onNowPlayingMenuClick"
      >
        <Icon name="more-vert" />
      </button>
    </div>

    <div
      class="full-cover-wrap"
      :class="{
        'lyrics-open': expanded && lyricsOpen,
        'is-open-target': !expanded,
      }"
      :role="expanded ? undefined : 'button'"
      :tabindex="expanded ? undefined : 0"
      :aria-label="expanded ? undefined : openLabel"
      @click="onCoverOrMetaOpen"
      @keydown.enter.space.prevent="onCoverOrMetaOpen"
    >
      <img
        class="full-cover"
        :src="coverFull"
        :alt="expanded ? 'Album cover' : ''"
      />
      <LyricsOverlay
        v-if="expanded"
        :open="lyricsOpen"
        :track-id="trackId"
        :current-time="currentTime"
        :duration="duration"
        :seekable="lyricsSeekable"
      />
    </div>

    <div
      class="full-meta"
      :class="{ 'is-open-target': !expanded }"
      :role="expanded ? undefined : 'button'"
      :tabindex="expanded ? undefined : 0"
      :aria-label="expanded ? undefined : openLabel"
      @click="onCoverOrMetaOpen"
      @keydown.enter.space.prevent="onCoverOrMetaOpen"
    >
      <div class="np-title-line">
        <div class="np-title">{{ title }}</div>
        <LossyMark :kind="lossyKind" />
      </div>
      <div class="np-artist">{{ subtitle }}</div>
    </div>

    <div class="seek-row">
      <span class="time">{{ formatTime(currentTime) }}</span>
      <input
        ref="seekEl"
        type="range"
        min="0"
        max="1000"
        step="1"
        :value="seekValue"
        :disabled="!seekInteractive"
        aria-label="Seek"
        @pointerdown="onSeekDown"
        @pointerup="onSeekUp"
        @input="onSeekInput"
      />
      <span class="time">{{ formatTime(duration) }}</span>
    </div>

    <div class="transport-buttons">
      <slot name="transport" />
    </div>

    <PlaybackStatusLine
      v-if="showStatus"
      :play-state="playState"
      :exclusive-snap="exclusiveSnap"
    />
    <div
      v-else-if="reserveStatus"
      class="np-status-wrap"
      aria-hidden="true"
    />

    <div class="player-extras">
      <label class="vol-label" title="Volume">
        <Icon name="volume" />
        <input
          ref="volEl"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          aria-label="Volume"
          @input="onVolInput"
        />
      </label>
      <button
        v-if="showLyricsToggle"
        type="button"
        class="icon-btn toggle lyrics-toggle"
        title="Lyrics"
        aria-label="Lyrics"
        :aria-pressed="lyricsOpen ? 'true' : 'false'"
        @click="emit('toggle-lyrics')"
      ><Icon name="lyrics" /></button>
      <button
        type="button"
        class="icon-btn"
        title="Settings"
        aria-label="Settings"
        aria-haspopup="dialog"
        @click="openSettings"
      ><Icon name="settings" /></button>
    </div>
    <ActionMenu
      :open="menuOpen"
      :items="menuItems"
      :anchor="menuAnchor"
      :restore-el="menuRestoreEl"
      @close="closeMenu"
    />
  </div>
</template>
