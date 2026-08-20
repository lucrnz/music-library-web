<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { coverUrl } from "@/api";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import LyricsOverlay from "@/components/player/LyricsOverlay.vue";
import { formatLossyCodecText, kindForTrack } from "@/lossyKind";
import { player } from "@/stores/playerState";
import {
  interpolatedPosition,
  radio,
  radioChromeActive,
  radioSubtitle,
  setVolume as setRadioVolume,
  tuneIn,
  tuneOut,
} from "@/stores/radio";
import { writeVolume } from "@/stores/playerPrefs";
import { getActiveStreamCodec, settings } from "@/stores/settings";
import { formatTime } from "@/util";

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
  if (radio.chrome === "tuned") return heardFromAudio();
  return interpolatedPosition();
}

function heardFromAudio(): number {
  return interpolatedPosition();
}

const title = computed(() => radio.track?.title || "");
const subtitle = computed(() => radioSubtitle(radio.track));
const lossyKind = computed(() => kindForTrack(radio.track));
const cover = computed(() => coverUrl(radio.track, props.layout === "bar" ? "thumb" : "full", false));
const waiting = computed(
  () => radio.face === "catching_up" || radio.face === "skip_pending",
);
const idle = computed(() => radio.face === "idle");
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
const codecLabel = computed(() => {
  if (radio.isLossy) return formatLossyCodecText(radio.track) || "Lossy source";
  const tag = getActiveStreamCodec();
  return settings.options.find((o) => o.id === tag)?.label || tag;
});

function onTune() {
  if (radio.chrome === "tuned" || radio.chrome === "tuning") tuneOut();
  else void tuneIn();
}

function onVolume(ev: Event) {
  const el = ev.target as HTMLInputElement;
  const v = Number(el.value);
  player.volume = v;
  writeVolume(v);
  setRadioVolume(v);
}
</script>

<template>
  <section
    class="radio-now"
    :class="'radio-now--' + props.layout"
    :aria-label="props.layout === 'room' ? 'Radio' : 'Now playing'"
  >
    <div v-if="waiting" class="radio-now-status" role="status">
      <span class="radio-spinner" aria-hidden="true" />
      <p>{{ statusLabel }}</p>
    </div>
    <div v-else-if="idle" class="radio-now-status radio-now-status--idle">
      <Icon name="radio" />
      <p>{{ statusLabel }}</p>
    </div>
    <template v-else>
      <div class="radio-now-cover-wrap">
        <img class="radio-now-cover" :src="cover" alt="" />
      </div>
      <div class="radio-now-meta">
        <div class="np-title-line">
          <div class="np-title">{{ title }}</div>
          <LossyMark :kind="lossyKind" />
        </div>
        <div class="np-artist">{{ subtitle }}</div>
        <p v-if="props.layout === 'room'" class="radio-codec">{{ codecLabel }}</p>
      </div>
      <div class="radio-now-clock">
        <span class="time">{{ formatTime(heard) }}</span>
        <input
          type="range"
          min="0"
          max="1000"
          step="1"
          :value="progress"
          disabled
          aria-label="Station position"
        />
        <span class="time">{{ formatTime(radio.officialDuration) }}</span>
      </div>
    </template>
    <div class="radio-now-transport">
      <button
        type="button"
        class="radio-tune-in"
        :disabled="tuneDisabled"
        @click="onTune"
      >
        {{ radio.chrome === "tuned" || radio.chrome === "tuning" ? "Tune out" : "Tune in" }}
      </button>
      <input
        v-if="radioChromeActive() && props.layout === 'bar'"
        type="range"
        class="radio-volume"
        min="0"
        max="1"
        step="0.01"
        :value="player.volume"
        aria-label="Volume"
        @input="onVolume"
      />
    </div>
    <LyricsOverlay
      v-if="props.layout === 'room' && radio.track?.id"
      :open="lyricsOpen"
      :track-id="radio.track.id"
      :current-time="heard"
      :duration="radio.officialDuration"
      :seekable="false"
    />
  </section>
</template>
