<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { coverUrl } from "@/api";
import Icon from "@/components/icons/Icon.vue";
import NowPlayingView from "@/components/player/NowPlayingView.vue";
import { router } from "@/router";
import { player } from "@/stores/playerState";
import {
  heardPosition,
  radio,
  RADIO_EXCLUSIVE_SNAP,
  radioPlayState,
  radioSubtitle,
  tuneIn,
  tuneOut,
} from "@/stores/radio";
import { setOutputVolume } from "@/stores/playerPrefs";

const props = withDefaults(
  defineProps<{
    layout?: "room" | "bar";
  }>(),
  { layout: "room" },
);

const heard = ref(0);
const lyricsOpen = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  heard.value = displayPosition();
  timer = setInterval(() => {
    heard.value = displayPosition();
  }, 250);
});
onUnmounted(() => {
  if (timer != null) clearInterval(timer);
});

function displayPosition(): number {
  return heardPosition();
}

const title = computed(() => radio.track?.title || "");
const subtitle = computed(() => radioSubtitle(radio.track));
const cover = computed(() =>
  coverUrl(radio.track, props.layout === "bar" ? "thumb" : "full", false),
);
const waiting = computed(
  () => radio.face === "catching_up" || radio.face === "skip_pending",
);
const showSurface = computed(
  () => radio.face === "current" && !!radio.track,
);
const compact = computed(() => props.layout === "bar");
const progress = computed(() => {
  const dur = radio.officialDuration;
  if (!dur) return 0;
  return Math.min(1000, Math.round((heard.value / dur) * 1000));
});
const statusLabel = computed(() => {
  if (radio.face === "catching_up") return "Catching up…";
  if (radio.face === "skip_pending") return "Finding the next track…";
  if (radio.face === "idle") return "Nothing on air";
  if (radio.chrome === "tuning") return "Tuning in…";
  return "";
});
const tuneDisabled = computed(
  () => radio.chrome === "tuning" || (radio.face !== "current" && radio.chrome !== "stopped"),
);
const tunedOrTuning = computed(
  () => radio.chrome === "tuned" || radio.chrome === "tuning",
);
const tuneIcon = computed(() => (tunedOrTuning.value ? "tune-out" : "tune-in"));
const tuneLabel = computed(() => (tunedOrTuning.value ? "Tune out" : "Tune in"));
const playState = computed(() => radioPlayState());

function onTune() {
  if (tunedOrTuning.value) tuneOut();
  else void tuneIn();
}

function onVolume(v: number) {
  setOutputVolume(v);
}

function openRadio() {
  void router.push({ name: "radio" });
}
</script>

<template>
  <section
    v-if="!showSurface"
    class="radio-now"
    :class="'radio-now--' + props.layout"
    :aria-label="props.layout === 'room' ? 'Radio' : 'Now playing'"
  >
    <div v-if="waiting" class="radio-now-status" role="status">
      <span class="radio-spinner" aria-hidden="true" />
      <p>{{ statusLabel }}</p>
    </div>
    <div v-else class="radio-now-status radio-now-status--idle">
      <Icon name="radio" />
      <p>{{ statusLabel }}</p>
    </div>
    <div class="radio-now-transport">
      <button
        type="button"
        class="radio-tune-in"
        :disabled="tuneDisabled"
        @click="onTune"
      >
        <Icon :name="tuneIcon" />
        {{ tuneLabel }}
      </button>
    </div>
  </section>
  <NowPlayingView
    v-else
    :title="title"
    :subtitle="subtitle"
    :cover-full="cover"
    :expanded="!compact"
    :seek-value="progress"
    :current-time="heard"
    :duration="radio.officialDuration"
    :volume="player.volume"
    :track="radio.track"
    :track-id="radio.track?.id ?? null"
    :seek-interactive="false"
    :lyrics-open="!compact && lyricsOpen"
    :lyrics-seekable="false"
    :show-close="false"
    :show-status="!compact && radio.chrome === 'tuned'"
    :reserve-status="!compact"
    :show-lyrics-toggle="!compact"
    :show-menu="!compact"
    :sheet-dismissible="false"
    :open-label="compact ? 'Open radio' : 'Open now playing'"
    :play-state="playState"
    :exclusive-snap="RADIO_EXCLUSIVE_SNAP"
    @volume="onVolume"
    @toggle-lyrics="lyricsOpen = !lyricsOpen"
    @cover-or-meta-open="openRadio"
  >
    <template #transport>
      <button
        type="button"
        class="radio-tune-in"
        :disabled="tuneDisabled"
        @click="onTune"
      >
        <Icon :name="tuneIcon" />
        {{ tuneLabel }}
      </button>
    </template>
  </NowPlayingView>
</template>
