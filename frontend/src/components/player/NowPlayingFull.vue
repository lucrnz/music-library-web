<script setup lang="ts">
/**
 * On-demand now-playing wrapper: NowPlayingView + queue transport.
 * Parent owns expand/collapse and mini bar.
 */
import { computed, ref, type Ref } from "vue";
import { exclusiveStatusSnapshot } from "@/stores/exclusiveAudio";
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
import type { ExclusiveFaceSnapshot } from "@/exclusive/statusFace";
import type { PlayStatusState } from "@/playbackStatus";
import Icon from "@/components/icons/Icon.vue";
import NowPlayingView from "@/components/player/NowPlayingView.vue";
import type { NowPlayingViewExpose } from "@/components/player/NowPlayingView.vue";

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

const viewRef = ref<NowPlayingViewExpose | null>(null);
const sheetDragY = ref<number | null>(null);

const playState = computed((): PlayStatusState => {
  void pl.index;
  void pl.tracks;
  return {
    playSource: player.playSource as PlayStatusState["playSource"],
    playProfileId: player.playProfileId,
    playBlockReason: player.playBlockReason,
    track: pl.current,
  };
});

const exclusiveSnap = computed(
  () => exclusiveStatusSnapshot() as ExclusiveFaceSnapshot,
);

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

function onSheetDragStart(clientY: number) {
  sheetDragY.value = clientY;
  player.draggingSheet = true;
}

function onSheetDragMove(clientY: number) {
  if (sheetDragY.value == null) return;
  player.sheetOffset = Math.max(0, clientY - sheetDragY.value);
}

function onSheetDragEnd(dy: number) {
  sheetDragY.value = null;
  player.draggingSheet = false;
  if (dy > 100) collapse();
  else player.sheetOffset = 0;
}

function onSeekDragging(dragging: boolean) {
  player.seeking = dragging;
}

function onSeekFraction(fraction: number) {
  seekToFraction(fraction);
}

function onVolume(v: number) {
  setVolume(v);
}

function focusClose() {
  viewRef.value?.focusClose();
}

defineExpose({
  focusClose,
  get closeBtn() {
    return viewRef.value?.closeBtn ?? ref<HTMLButtonElement | null>(null);
  },
});
</script>

<template>
  <NowPlayingView
    ref="viewRef"
    :title="title"
    :subtitle="subtitle"
    :cover-full="coverFull"
    :close-icon="closeIcon"
    :np-modal="npModal"
    :expanded="player.expanded"
    :seek-value="seekValue"
    :current-time="player.currentTime"
    :duration="player.duration"
    :volume="player.volume"
    :track="pl.current"
    :track-id="trackId"
    :seek-interactive="true"
    :lyrics-open="player.lyricsOpen"
    :lyrics-seekable="true"
    :show-close="true"
    :show-status="player.expanded"
    :show-lyrics-toggle="player.expanded"
    :show-menu="player.expanded && !!pl.current"
    :sheet-dismissible="true"
    :play-state="playState"
    :exclusive-snap="exclusiveSnap"
    @collapse="collapse"
    @cover-or-meta-open="onCoverOrMetaOpen"
    @seek-fraction="onSeekFraction"
    @seek-dragging="onSeekDragging"
    @volume="onVolume"
    @toggle-lyrics="toggleLyrics"
    @sheet-drag-start="onSheetDragStart"
    @sheet-drag-move="onSheetDragMove"
    @sheet-drag-end="onSheetDragEnd"
  >
    <template #transport>
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
    </template>
  </NowPlayingView>
</template>
