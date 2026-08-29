<script setup lang="ts">
import { computed } from "vue";
import { coverUrl } from "@/api";
import { formatTime } from "@/util";
import { cd, enterCdMode } from "@/stores/cd";
import { cdLoad } from "@/playback/cdLoad";
import { player } from "@/stores/playerState";
import { toggleCdRail, toggleRadioRail } from "@/stores/playerPrefs";
import { useDesktopViewport } from "@/layout";
import { canShowCdUi } from "@/exclusive/capability";
import Icon from "@/components/icons/Icon.vue";
import type { Track } from "@/models/track";

const desktop = useDesktopViewport();
const showChrome = computed(() => desktop.value && canShowCdUi());
const emptyCopy = computed(() =>
  cd.face === "no_disc" ? "No disc" : "Insert a disc",
);

function onCdButton() {
  if (player.expanded && player.railFace === "cd") {
    toggleCdRail();
    return;
  }
  enterCdMode();
}

function onRowClick(index: number) {
  void cdLoad(index);
}

function trackCover(track: Track) {
  return coverUrl(track, "thumb", false);
}

function trackSub(track: Track) {
  return [track.artist, track.album].filter(Boolean).join(" - ");
}
</script>

<template>
  <section id="view-cd-list" class="view" aria-label="CD">
    <div v-if="showChrome" class="view-bar">
      <div class="view-title">CD</div>
      <div class="view-actions">
        <button
          type="button"
          class="icon-btn"
          title="Radio"
          aria-label="Radio"
          :aria-pressed="player.expanded && player.railFace === 'radio' ? 'true' : 'false'"
          @click="toggleRadioRail"
        ><Icon name="radio" /></button>
        <button
          type="button"
          class="icon-btn"
          title="CD"
          aria-label="CD"
          :aria-pressed="player.expanded && player.railFace === 'cd' ? 'true' : 'false'"
          @click="onCdButton"
        ><Icon name="cd" /></button>
      </div>
    </div>
    <div class="row-list">
      <div v-if="!cd.tracks.length" class="list-empty">{{ emptyCopy }}</div>
      <div
        v-for="(track, index) in cd.tracks"
        :key="(track.id || index) + '-' + index"
        class="row"
        :class="{ playing: index === cd.index }"
        @click="onRowClick(index)"
      >
        <span class="row-cover-wrap">
          <img class="row-cover" :src="trackCover(track)" alt="" loading="lazy" />
          <span
            v-if="index === cd.index"
            class="eq"
            :class="{ paused: player.paused }"
          ><span></span><span></span><span></span></span>
        </span>
        <span class="row-meta">
          <span class="row-title-line">
            <span class="row-title">{{ track.title }}</span>
          </span>
          <span class="row-sub">{{ trackSub(track) }}</span>
        </span>
        <span class="row-dur">{{ formatTime(track.duration) }}</span>
      </div>
    </div>
  </section>
</template>
