<script setup lang="ts">
/**
 * Shared track list row (library + downloads + search).
 */
import { computed } from "vue";
import { coverUrl } from "@/api";
import { resolveRowCover } from "@/components/library/rowCover";
import { formatTime, formatTrackLabel } from "@/util";
import DownloadIcon from "@/components/downloads/DownloadIcon.vue";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import { kindForTrack } from "@/lossyKind";
import { useDesktopViewport } from "@/layout";
import { playOrQueueTrack, queueOnly } from "@/components/library/rows";
import type { Track } from "@/models/track";
const props = withDefaults(defineProps<{
  track: Track | null;
  coverSrc?: string | null;
  showDownload?: boolean;
  titleMode?: string;
  subtitleMode?: string;
  showMenu?: boolean;
}>(), { coverSrc: null, showDownload: true, titleMode: "label", subtitleMode: "artist", track: null, showMenu: false });
const emit = defineEmits<{
  play: [track: Track];
  queue: [track: Track];
  "menu-click": [track: Track, e: MouseEvent];
  "row-contextmenu": [track: Track, e: MouseEvent];
}>();
const desktop = useDesktopViewport();
const cover = computed(() =>
      resolveRowCover(props.coverSrc, coverUrl(props.track, "thumb", false))
    );

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
        return [t.artist, t.album].filter(Boolean).join(" - ");
      }
      return t.artist || "";
    });

    const lossyKind = computed(() => kindForTrack(props.track));
    const durationLabel = computed(() => {
      const sec = props.track?.duration;
      if (sec == null || !Number.isFinite(sec) || sec < 0) return "";
      return formatTime(sec);
    });

    async function onPlay(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".row-add") ||
        target.closest(".row-menu") ||
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

    function onMenuClick(e: MouseEvent) {
      e.stopPropagation();
      e.preventDefault();
      if (!props.track) return;
      emit("menu-click", props.track, e);
    }

    function onContext(e: MouseEvent) {
      if (!props.showMenu || !props.track) return;
      emit("row-contextmenu", props.track, e);
    }
</script>

<template>
    <div v-if="track" class="row" @click="onPlay" @contextmenu="onContext">
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
      <span v-if="durationLabel" class="row-dur">{{ durationLabel }}</span>
      <DownloadIcon v-if="showDownload" :track="track" />
      <button
        v-if="showMenu"
        type="button"
        class="icon-btn row-menu"
        title="Track actions"
        aria-label="Track actions"
        :aria-haspopup="desktop ? 'menu' : 'dialog'"
        @click="onMenuClick"
      ><Icon name="more-vert" /></button>
      <button
        v-else
        type="button"
        class="icon-btn row-add"
        title="Add to playlist"
        aria-label="Add to playlist"
        @click="onQueue"
      ><Icon name="plus" /></button>
    </div>
</template>
