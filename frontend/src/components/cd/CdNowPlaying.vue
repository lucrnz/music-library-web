<script setup lang="ts">
import { computed } from "vue";
import NowPlayingView from "@/components/player/NowPlayingView.vue";
import { exclusiveStatusSnapshot } from "@/stores/exclusiveAudio";
import CdMatchPicker from "@/components/cd/CdMatchPicker.vue";
import { cd, reopenPicker, toggleCdSession } from "@/stores/cd";
import {
  cdCycleRepeat,
  cdEject,
  cdNext,
  cdPrev,
  cdSeek,
  cdSetShuffle,
  cdToggle,
} from "@/playback/cdLoad";
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import { player } from "@/stores/playerState";
import { setExpanded, setOutputVolume } from "@/stores/playerPrefs";
import { coverUrl } from "@/api";
import { cdromCoverUrl, isCdromTrack, VA_ARTIST_THUMB } from "@/cd/cdrom";
import { resolveCdromLyrics } from "@/lyrics/cdrom";
import { activeSession } from "@/playback/session";
import type { PlayStatusState } from "@/playbackStatus";
import { useDesktopViewport } from "@/layout";

const props = withDefaults(
  defineProps<{
    layout?: "room" | "bar";
  }>(),
  { layout: "room" },
);

const emit = defineEmits<{
  collapse: [];
}>();

const desktop = useDesktopViewport();
const compact = computed(() => props.layout === "bar");
const current = computed(() =>
  cd.index >= 0 ? cd.tracks[cd.index] ?? null : null,
);
const dataDisc = computed(
  () =>
    cd.mediaKind === "data" ||
    cd.face === "data" ||
    cd.face === "no_playable" ||
    !!(current.value && isCdromTrack(current.value)),
);
const title = computed(() => {
  if (current.value?.title) return current.value.title;
  if (dataDisc.value) return cd.volumeName || "Data CD";
  return "Audio CD";
});
const subtitle = computed(() => {
  const t = current.value;
  if (!t) {
    if (cd.face === "no_disc") return "No disc";
    if (cd.face === "drive_missing") return "Drive missing";
    if (cd.face === "no_playable") return "No playable audio";
    if (cd.face === "data") return cd.volumeName || "Data CD";
    if (cd.face === "not_audio") return "Not an audio CD";
    if (cd.face === "companion_offline") return "Companion offline";
    if (cd.face === "needs_setting") return "Enable CD playback in Settings";
    if (cd.face === "needs_libcdio") return "Install libcdio";
    return "Insert a disc";
  }
  return [t.artist, t.album].filter(Boolean).join(" · ");
});
const cover = computed(() => {
  const t = current.value;
  if (t && isCdromTrack(t)) return cdromCoverUrl(t);
  if (t?.albumId) return coverUrl(t, compact.value ? "thumb" : "full", false);
  if (dataDisc.value) return VA_ARTIST_THUMB;
  return "/static/img/audio-cd.svg";
});
const playState = computed((): PlayStatusState => ({
  session: activeSession() === "cd" ? "cd" : "none",
  playSource: activeSession() === "cd" ? "cd" : "none",
  playProfileId:
    dataDisc.value || (current.value && isCdromTrack(current.value))
      ? "cdrom"
      : "cdda",
  cdFace: cd.face,
  cdVolumeName: cd.volumeName,
  track: current.value,
}));
const showLyricsToggle = computed(
  () => !!(current.value && isCdromTrack(current.value)),
);
const showChangeDisc = computed(() => {
  if (cd.mediaKind === "data") return false;
  if (cd.face === "data" || cd.face === "no_playable") return false;
  if (current.value && isCdromTrack(current.value)) return false;
  return !!(cd.mediaPresent && (cd.matches.length || cd.lastDiscid));
});
const canEject = computed(
  () =>
    cd.mediaPresent &&
    exclusiveAudio.role === "controller" &&
    !!cd.selectedDriveId,
);
const seekValue = computed(() => {
  if (!player.duration) return 0;
  return Math.round((player.currentTime / player.duration) * 1000);
});
const exclusiveSnap = computed(() => exclusiveStatusSnapshot());
const showRoomClose = computed(() => !compact.value && desktop.value);

function collapse() {
  setExpanded(false);
  emit("collapse");
}
</script>

<template>
  <NowPlayingView
    :title="title"
    :subtitle="subtitle"
    :cover-full="cover"
    :track="current"
    :expanded="!compact"
    :show-close="showRoomClose"
    :show-status="true"
    :reserve-status="true"
    :show-lyrics-toggle="showLyricsToggle"
    :show-menu="false"
    :seek-interactive="!!current"
    :seek-value="seekValue"
    :play-state="playState"
    :exclusive-snap="exclusiveSnap"
    :track-id="current?.id ?? null"
    :lyrics-open="player.lyricsOpen && showLyricsToggle"
    :resolve="resolveCdromLyrics"
    :current-time="player.currentTime"
    :duration="player.duration"
    :volume="player.volume"
    @volume="setOutputVolume"
    @collapse="collapse"
    @toggle-lyrics="player.lyricsOpen = !player.lyricsOpen"
    @seek-fraction="(f) => cdSeek(f * (player.duration || 0))"
  >
    <template #transport>
      <div class="cd-transport">
        <button type="button" class="icon-btn" aria-label="Previous" @click="cdPrev">
          <span class="sr-only">Previous</span>‹
        </button>
        <button type="button" class="icon-btn" aria-label="Play" @click="cdToggle">
          {{ player.paused ? "Play" : "Pause" }}
        </button>
        <button type="button" class="icon-btn" aria-label="Next" @click="cdNext">
          ›
        </button>
        <button
          type="button"
          class="pill"
          :aria-pressed="cd.shuffle ? 'true' : 'false'"
          @click="cdSetShuffle(!cd.shuffle)"
        >Shuffle</button>
        <button type="button" class="pill" @click="cdCycleRepeat">
          Repeat {{ cd.repeat }}
        </button>
        <button
          type="button"
          class="pill"
          :disabled="!canEject"
          @click="cdEject"
        >Eject</button>
        <button
          v-if="showChangeDisc"
          type="button"
          class="pill"
          @click="reopenPicker"
        >Change disc…</button>
        <button
          type="button"
          class="pill"
          title="Leave CD"
          aria-label="Leave CD"
          @click="toggleCdSession"
        >Leave</button>
      </div>
    </template>
  </NowPlayingView>
  <CdMatchPicker />
</template>
