<script setup lang="ts">
import { computed } from "vue";
import { coverUrl } from "@/api";
import { playOrQueueTrack } from "@/components/library/rows";
import LossyMark from "@/components/lossy/LossyMark.vue";
import { kindForTrack } from "@/lossyKind";
import type { ListenTrack } from "@/listens/types";
import { formatTrackLabel } from "@/util";

const props = defineProps<{
  track: ListenTrack;
}>();

const cover = computed(() => coverUrl(props.track, "thumb", false));
const lossyKind = computed(() => kindForTrack(props.track));
const title = computed(() => formatTrackLabel(props.track));

async function onPlay(e: MouseEvent) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".lossy-mark")) return;
  await playOrQueueTrack(props.track);
}
</script>

<template>
  <div class="row" @click="onPlay">
    <span class="row-cover-wrap">
      <img class="row-cover" :src="cover" alt="" loading="lazy" />
    </span>
    <span class="row-meta">
      <span class="row-title-line">
        <span class="row-title">{{ title }}</span>
        <LossyMark :kind="lossyKind" />
      </span>
      <span v-if="track.artist" class="row-sub">{{ track.artist }}</span>
    </span>
    <span class="row-plays">{{ track.playCount }}</span>
  </div>
</template>
