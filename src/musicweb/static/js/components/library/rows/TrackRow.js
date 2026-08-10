/**
 * Shared track list row (library + downloads + search).
 */
import { computed, defineComponent } from "vue";
import { coverUrl } from "../../../api.js";
import { formatTrackLabel } from "../../../util.js";
import DownloadIcon from "../../downloads/DownloadIcon.js";
import Icon from "../../icons/Icon.js";
import { playOrQueueTrack, queueOnly } from "../rows.js";

export default defineComponent({
  name: "TrackRow",
  components: { Icon, DownloadIcon },
  props: {
    track: { type: Object, required: true },
    /** Override cover URL (e.g. local OPFS blob). */
    coverSrc: { type: String, default: "" },
    showDownload: { type: Boolean, default: true },
    /** 'label' = formatTrackLabel; 'title' = track.title only */
    titleMode: { type: String, default: "label" },
    /** 'artist' | 'artist-album' | 'none' */
    subtitleMode: { type: String, default: "artist" },
  },
  emits: ["play", "queue"],
  setup(props, { emit }) {
    const cover = computed(() => {
      if (props.coverSrc) return props.coverSrc;
      return coverUrl(props.track, "thumb", false);
    });

    const title = computed(() => {
      if (props.titleMode === "title") return props.track.title || "";
      return formatTrackLabel(props.track);
    });

    const subtitle = computed(() => {
      const t = props.track;
      if (props.subtitleMode === "none") return "";
      if (props.subtitleMode === "artist-album") {
        return [t.artist, t.album].filter(Boolean).join(" — ");
      }
      return t.artist || "";
    });

    async function onPlay(e) {
      if (e.target.closest(".row-add") || e.target.closest(".row-download")) {
        return;
      }
      emit("play", props.track);
      await playOrQueueTrack(props.track);
    }

    async function onQueue(e) {
      e.stopPropagation();
      emit("queue", props.track);
      await queueOnly(props.track);
    }

    return { cover, title, subtitle, onPlay, onQueue };
  },
  template: `
    <div class="row" @click="onPlay">
      <span class="row-cover-wrap">
        <img class="row-cover" :src="cover" alt="" loading="lazy" />
      </span>
      <span class="row-meta">
        <span class="row-title">{{ title }}</span>
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
  `,
});
