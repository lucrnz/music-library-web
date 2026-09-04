<script setup lang="ts">
import { computed } from "vue";
import Icon from "@/components/icons/Icon.vue";
import { useDesktopViewport } from "@/layout";
import { router } from "@/router";
import { cdToggle, cdNext } from "@/playback/cdLoad";
import { cd, toggleCdSession } from "@/stores/cd";
import { openCdRail, setOutputVolume } from "@/stores/playerPrefs";
import { player } from "@/stores/playerState";
import { coverUrl } from "@/api";
import { cdromCoverUrl, isCdromTrack, VA_ARTIST_THUMB } from "@/cd/cdrom";
import { kindForTrack } from "@/lossyKind";
import LossyMark from "@/components/lossy/LossyMark.vue";

const desktop = useDesktopViewport();
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
    return "Audio CD";
  }
  return [t.artist, t.album].filter(Boolean).join(" · ");
});
const cover = computed(() => {
  const t = current.value;
  if (t && isCdromTrack(t)) return cdromCoverUrl(t);
  if (t?.albumId) return coverUrl(t, "thumb", false);
  if (dataDisc.value) return VA_ARTIST_THUMB;
  return "/static/img/audio-cd.svg";
});
const playIcon = computed(() => (player.paused ? "play" : "pause"));
const lossyKind = computed(() => kindForTrack(current.value));

function openCd() {
  if (desktop.value) {
    openCdRail();
    return;
  }
  void router.push({ name: "cd" });
}

function onVolume(e: Event) {
  const el = e.target;
  if (!(el instanceof HTMLInputElement)) return;
  setOutputVolume(Number(el.value));
}
</script>

<template>
  <div class="player-mini cd-mini">
    <button
      type="button"
      class="radio-mini-open"
      aria-label="Open CD"
      @click="openCd"
    >
      <img class="mini-cover" :src="cover" alt="" />
      <span class="mini-meta">
        <span class="np-title">{{ title }}</span>
        <span class="np-artist">{{ subtitle }}</span>
      </span>
    </button>
    <LossyMark :kind="lossyKind" />
    <button
      type="button"
      class="icon-btn"
      :title="player.paused ? 'Play' : 'Pause'"
      :aria-label="player.paused ? 'Play' : 'Pause'"
      @click="cdToggle"
    >
      <Icon :name="playIcon" />
    </button>
    <button
      type="button"
      class="icon-btn"
      title="Next"
      aria-label="Next"
      @click="cdNext"
    >
      <Icon name="next" />
    </button>
    <label class="vol-label" title="Volume">
      <Icon name="volume" />
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="player.volume"
        aria-label="Volume"
        @input="onVolume"
      />
    </label>
    <button
      type="button"
      class="pill"
      title="Leave CD"
      aria-label="Leave CD"
      @click="toggleCdSession"
    >Leave</button>
  </div>
</template>
