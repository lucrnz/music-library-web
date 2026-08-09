/**
 * Compact download control for track rows.
 */
import { computed, defineComponent } from "vue";
import {
  downloads,
  downloadTrack,
  trackDownloadState,
} from "../../stores/downloads.js";
import Icon from "../icons/Icon.js";

export default defineComponent({
  name: "DownloadIcon",
  components: { Icon },
  props: {
    track: { type: Object, required: true },
  },
  setup(props) {
    const state = computed(() => {
      if (!downloads.enabled) return "hidden";
      if (!props.track?.id || props.track.is_missing) return "hidden";
      return trackDownloadState(props.track.id);
    });

    const title = computed(() => {
      switch (state.value) {
        case "ready":
          return "Downloaded";
        case "other":
          return "Downloaded in another codec — tap to download current";
        case "pending":
          return "Queued";
        case "active":
          return "Downloading…";
        case "paused":
          return "Download paused";
        case "failed":
          return "Download failed — tap to retry";
        default:
          return "Download";
      }
    });

    const iconName = computed(() => {
      switch (state.value) {
        case "ready":
          return "check";
        case "other":
          return "download-check";
        case "failed":
          return "download";
        case "pending":
        case "active":
        case "paused":
          return "download";
        default:
          return "download";
      }
    });

    const busy = computed(
      () =>
        state.value === "pending" ||
        state.value === "active" ||
        state.value === "paused"
    );

    async function onClick(e) {
      e.stopPropagation();
      e.preventDefault();
      if (!downloads.enabled || !props.track?.id) return;
      if (state.value === "ready") return;
      if (busy.value) return;
      try {
        await downloadTrack(props.track);
      } catch (err) {
        console.error(err);
        alert(err.message || "Download failed");
      }
    }

    return { state, title, iconName, busy, onClick, downloads };
  },
  template: `
    <button
      v-if="state !== 'hidden'"
      type="button"
      class="icon-btn row-download"
      :class="{
        'is-ready': state === 'ready',
        'is-other': state === 'other',
        'is-busy': busy,
        'is-failed': state === 'failed',
      }"
      :title="title"
      :aria-label="title"
      :disabled="busy || state === 'ready'"
      @click="onClick"
    >
      <span v-if="busy" class="dl-spinner" aria-hidden="true"></span>
      <Icon v-else :name="iconName" />
    </button>
  `,
});
