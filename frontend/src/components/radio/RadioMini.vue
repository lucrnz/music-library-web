<script setup lang="ts">
import { computed } from "vue";
import { coverUrl } from "@/api";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import { kindForTrack } from "@/lossyKind";
import { router } from "@/router";
import { radio, radioSubtitle, tuneIn, tuneOut } from "@/stores/radio";

const title = computed(() => radio.track?.title || "Radio");
const subtitle = computed(() => radioSubtitle(radio.track) || "Household radio");
const cover = computed(() => coverUrl(radio.track, "thumb", false));
const lossyKind = computed(() => kindForTrack(radio.track));
const tunedOrTuning = computed(
  () => radio.chrome === "tuned" || radio.chrome === "tuning",
);
const tuneIcon = computed(() => (tunedOrTuning.value ? "tune-out" : "tune-in"));
const tuneLabel = computed(() => (tunedOrTuning.value ? "Tune out" : "Tune in"));

function onPlay() {
  if (tunedOrTuning.value) tuneOut();
  else void tuneIn();
}

function openRadio() {
  void router.push({ name: "radio" });
}
</script>

<template>
  <div class="player-mini radio-mini">
    <button
      type="button"
      class="radio-mini-open"
      aria-label="Open radio"
      @click="openRadio"
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
      :title="tuneLabel"
      :aria-label="tuneLabel"
      @click="onPlay"
    >
      <Icon :name="tuneIcon" />
    </button>
  </div>
</template>
