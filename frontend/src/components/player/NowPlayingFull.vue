<script setup lang="ts">
/**
 * Expanded / full player chrome: sheet grab, cover, seek, transport, extras.
 * Parent owns expand/collapse and mini bar.
 * Delivery status lives in PlaybackStatusLine.
 */
import { computed, nextTick, ref, watch, type Ref } from "vue";
import { pl } from "@/stores/playlist";
import {
  player,
  playNext,
  playPrev,
  togglePlay,
  toggleShuffle,
  cycleRepeat,
  seekToFraction,
  setVolume,
} from "@/stores/player";
import { canReachServer } from "@/connectivity";
import { copyText } from "@/clipboard";
import { peekLyricsMemory, resolveLyrics } from "@/lyrics/cache";
import { lyricsClipboardText } from "@/lyrics/plainText";
import { openSettings } from "@/stores/settings";
import { showToast } from "@/stores/ui";
import { formatTime, setRangeFill } from "@/util";
import { kindForTrack } from "@/lossyKind";
import ActionMenu from "@/components/menu/ActionMenu.vue";
import { useRowActionMenu } from "@/components/menu/useRowActionMenu";
import { useDesktopViewport } from "@/layout";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import LyricsOverlay from "@/components/player/LyricsOverlay.vue";
import { buildNowPlayingMenuItems } from "@/components/player/nowPlayingMenuItems";
import PlaybackStatusLine from "@/components/player/PlaybackStatusLine.vue";

const DESKTOP_BREAKPOINT = "(min-width: 900px)";

function isDesktop() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(DESKTOP_BREAKPOINT).matches
  );
}

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    coverFull?: string;
    playIcon?: string;
    repeatIcon?: string;
    closeIcon?: string;
    npModal?: boolean;
    seekValue?: number;
    trackId?: string | null;
  }>(),
  {
    title: "—",
    subtitle: "",
    coverFull: "",
    playIcon: "play",
    repeatIcon: "repeat",
    closeIcon: "close",
    npModal: false,
    seekValue: 0,
    trackId: null,
  },
);
const emit = defineEmits<{
  collapse: [];
  "cover-or-meta-open": [ev?: MouseEvent | KeyboardEvent];
  "close-focus": [];
}>();

export type NowPlayingFullExpose = {
  focusClose: () => void;
  closeBtn: Ref<HTMLButtonElement | null>;
};

const seekEl = ref<HTMLInputElement | null>(null);
const volEl = ref<HTMLInputElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
const sheetDragY = ref<number | null>(null);

const lossyKind = computed(() => kindForTrack(pl.current));

function collapse() {
  emit("collapse");
}

function onCoverOrMetaOpen(ev?: MouseEvent | KeyboardEvent) {
  emit("cover-or-meta-open", ev);
}

function toggleLyrics() {
  if (!player.expanded) return;
  player.lyricsOpen = !player.lyricsOpen;
}

function onSheetDown(e: PointerEvent) {
  if (isDesktop()) return;
  sheetDragY.value = e.clientY;
  player.draggingSheet = true;
  const target = e.currentTarget;
  if (target instanceof HTMLElement) {
    target.setPointerCapture?.(e.pointerId);
  }
}

function onSheetMove(e: PointerEvent) {
  if (sheetDragY.value == null) return;
  player.sheetOffset = Math.max(0, e.clientY - sheetDragY.value);
}

function onSheetUp(e: PointerEvent) {
  if (sheetDragY.value == null) return;
  const dy = e.clientY - sheetDragY.value;
  sheetDragY.value = null;
  player.draggingSheet = false;
  if (dy > 100) collapse();
  else player.sheetOffset = 0;
}

function onSeekDown() {
  player.seeking = true;
}

function rangeTarget(e: Event): HTMLInputElement | null {
  return e.target instanceof HTMLInputElement ? e.target : null;
}

function onSeekUp(e: Event) {
  player.seeking = false;
  const el = rangeTarget(e);
  if (!el) return;
  const val = Number(el.value);
  seekToFraction(val / 1000);
}

function onSeekInput(e: Event) {
  const el = rangeTarget(e);
  if (el) setRangeFill(el);
}

function onVolInput(e: Event) {
  const el = rangeTarget(e);
  if (!el) return;
  setVolume(Number(el.value));
  setRangeFill(el);
}

watch(
  () => [player.currentTime, player.duration, player.seeking],
  async () => {
    await nextTick();
    if (!player.seeking && seekEl.value) {
      seekEl.value.value = String(props.seekValue);
      setRangeFill(seekEl.value);
    }
  },
);

watch(
  () => player.volume,
  async () => {
    await nextTick();
    if (volEl.value) {
      volEl.value.value = String(player.volume);
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

const desktop = useDesktopViewport();
const {
  menuAnchor,
  menuRestoreEl,
  closeMenu,
  openMenu,
} = useRowActionMenu();
const menuOpen = computed(() => !!menuAnchor.value);

const currentTrack = computed(() => pl.current);

const offerCopyLyrics = ref(true);

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
  const track = currentTrack.value;
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
  () => [player.expanded, props.trackId] as const,
  () => closeMenu(),
);

defineExpose({ focusClose, closeBtn });
</script>

<template>
    <div
      class="player-full"
      :role="npModal ? 'dialog' : player.expanded ? 'complementary' : undefined"
      :aria-modal="npModal ? 'true' : undefined"
      :aria-label="player.expanded ? 'Now playing' : undefined"
    >
      <div
        class="sheet-grab"
        @pointerdown="onSheetDown"
        @pointermove="onSheetMove"
        @pointerup="onSheetUp"
      >
        <button
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
          v-if="player.expanded && currentTrack"
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
          'lyrics-open': player.expanded && player.lyricsOpen,
          'is-open-target': !player.expanded,
        }"
        :role="player.expanded ? undefined : 'button'"
        :tabindex="player.expanded ? undefined : 0"
        :aria-label="player.expanded ? undefined : 'Open now playing'"
        @click="onCoverOrMetaOpen"
        @keydown.enter.space.prevent="onCoverOrMetaOpen"
      >
        <img
          class="full-cover"
          :src="coverFull"
          :alt="player.expanded ? 'Album cover' : ''"
        />
        <LyricsOverlay
          v-if="player.expanded"
          :open="player.lyricsOpen"
          :track-id="trackId"
          :current-time="player.currentTime"
          :duration="player.duration"
        />
      </div>

      <div
        class="full-meta"
        :class="{ 'is-open-target': !player.expanded }"
        :role="player.expanded ? undefined : 'button'"
        :tabindex="player.expanded ? undefined : 0"
        :aria-label="player.expanded ? undefined : 'Open now playing'"
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
        <span class="time">{{ formatTime(player.currentTime) }}</span>
        <input
          ref="seekEl"
          type="range"
          min="0"
          max="1000"
          step="1"
          :value="seekValue"
          aria-label="Seek"
          @pointerdown="onSeekDown"
          @pointerup="onSeekUp"
          @input="onSeekInput"
        />
        <span class="time">{{ formatTime(player.duration) }}</span>
      </div>

      <div class="transport-buttons">
        <button
          type="button"
          class="icon-btn toggle"
          title="Shuffle"
          :aria-pressed="pl.shuffle ? 'true' : 'false'"
          aria-label="Shuffle"
          @click="toggleShuffle"
        ><Icon name="shuffle" /></button>
        <button
          type="button"
          class="icon-btn"
          title="Previous"
          aria-label="Previous"
          @click="playPrev"
        >
          <Icon name="prev" />
        </button>
        <button
          type="button"
          class="icon-btn primary"
          title="Play / Pause"
          aria-label="Play / Pause"
          @click="togglePlay"
        >
          <Icon :name="playIcon" />
        </button>
        <button
          type="button"
          class="icon-btn"
          title="Next"
          aria-label="Next"
          @click="playNext"
        >
          <Icon name="next" />
        </button>
        <button
          type="button"
          class="icon-btn toggle"
          title="Repeat"
          :aria-pressed="pl.repeat !== 'off' ? 'true' : 'false'"
          aria-label="Repeat"
          @click="cycleRepeat"
        ><Icon :name="repeatIcon" /></button>
      </div>

      <PlaybackStatusLine v-if="player.expanded" />

      <div class="player-extras">
        <label class="vol-label" title="Volume">
          <Icon name="volume" />
          <input
            ref="volEl"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="player.volume"
            aria-label="Volume"
            @input="onVolInput"
          />
        </label>
        <button
          type="button"
          class="icon-btn toggle lyrics-toggle"
          title="Lyrics"
          aria-label="Lyrics"
          :aria-pressed="player.lyricsOpen ? 'true' : 'false'"
          @click="toggleLyrics"
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
