<script setup lang="ts">
/**
 * Shared track list row (library + downloads + search).
 */
import { computed } from "vue";
import { coverUrl } from "@/api";
import { formatTrackLabel } from "@/util";
import DownloadIcon from "@/components/downloads/DownloadIcon.vue";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import { kindForTrack } from "@/lossyKind";
import { playOrQueueTrack, queueOnly } from "@/components/library/rows";
import type { Track } from "@/models/track";
const props = withDefaults(defineProps<{
  track: Track | null;
  coverSrc?: string;
  showDownload?: boolean;
  titleMode?: string;
  subtitleMode?: string;
}>(), { coverSrc: "", showDownload: true, titleMode: "label", subtitleMode: "artist", track: null });
const emit = defineEmits<{
  play: [track: Track];
  queue: [track: Track];
}>();
const cover = computed(() => {
      if (props.coverSrc) return props.coverSrc;
      return coverUrl(props.track, "thumb", false);
    });

    const title = computed(() => {
      if (!props.track) return "";
      if (props.titleMode === "title") return props.track.title || "";
      return formatTrackLabel(props.track);
    });

    const subtitle = computed(() => {
      const t = props.track;
      if (!t) return "";
      if (props.subtitleMode === "none") return "";
      if (props.subtitleMode === "artist-album") {
        return [t.artist, t.album].filter(Boolean).join(" — ");
      }
      return t.artist || "";
    });

    const lossyKind = computed(() => kindForTrack(props.track));

    async function onPlay(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".row-add") ||
        target.closest(".row-download") ||
        target.closest(".lossy-mark")
      ) {
        return;
      }
      if (!props.track) return;
      emit("play", props.track);
      await playOrQueueTrack(props.track);
    }

    async function onQueue(e: MouseEvent) {
      e.stopPropagation();
      if (!props.track) return;
      emit("queue", props.track);
      await queueOnly(props.track);
    }
</script>

<template>
    <div v-if="track" class="row" @click="onPlay">
      <span class="row-cover-wrap">
        <img class="row-cover" :src="cover" alt="" loading="lazy" />
      </span>
      <span class="row-meta">
        <span class="row-title-line">
          <span class="row-title">{{ title }}</span>
          <LossyMark :kind="lossyKind" />
        </span>
        <span v-if="subtitle" class="row-sub">{{ subtitle }}</span>
      </span>
      <DownloadIcon v-if="showDownload" :track="track" />
      <button
        type="button"
        class="icon-btn row-add"
        title="Add to playlist"
        aria-label="Add to playlist"
        @click="onQueue"
      ><Icon name="plus" /></button>
    </div>
</template>
