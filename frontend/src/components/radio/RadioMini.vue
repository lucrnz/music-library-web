<script setup lang="ts">
import { computed } from "vue";
import { coverUrl } from "@/api";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import { kindForTrack } from "@/lossyKind";
import { radio, radioSubtitle, tuneIn, tuneOut } from "@/stores/radio";

const title = computed(() => radio.track?.title || "Radio");
const subtitle = computed(() => radioSubtitle(radio.track) || "Household radio");
const cover = computed(() => coverUrl(radio.track, "thumb", false));
const lossyKind = computed(() => kindForTrack(radio.track));
const playIcon = computed(() =>
  radio.chrome === "tuned" || radio.chrome === "tuning" ? "pause" : "play",
);

function onPlay() {
  if (radio.chrome === "tuned" || radio.chrome === "tuning") tuneOut();
  else void tuneIn();
}
</script>

<template>
  <div class="player-mini radio-mini">
    <img class="mini-cover" :src="cover" alt="" />
    <div class="mini-meta">
      <span class="np-title">{{ title }}</span>
      <span class="np-artist">{{ subtitle }}</span>
    </div>
    <LossyMark :kind="lossyKind" />
    <button
      type="button"
      class="icon-btn"
      :title="playIcon === 'pause' ? 'Tune out' : 'Tune in'"
      :aria-label="playIcon === 'pause' ? 'Tune out' : 'Tune in'"
      @click="onPlay"
    >
      <Icon :name="playIcon" />
    </button>
  </div>
</template>
