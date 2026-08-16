/**
 * Compact download control for track rows.
 */
import { computed, defineComponent } from "vue";
import {
  downloadActionKind,
  isBusyDownloadKind,
} from "../../downloads/actionKind.js";
import { downloadTrack } from "../../downloads/ui.js";
import { showToast } from "../../stores/ui.js";
import Icon from "../icons/Icon.js";

export default defineComponent({
  name: "DownloadIcon",
  components: { Icon },
  props: {
    track: { type: Object, required: true },
  },
  setup(props) {
    const kind = computed(() => downloadActionKind(props.track).kind);

    const title = computed(() => {
      switch (kind.value) {
        case "ready":
          return "Downloaded";
        case "other":
          return "Downloaded at a different quality — tap to download at download quality";
        case "pending":
          return "Queued";
        case "active":
          return "Downloading…";
        case "paused":
          return "Download paused";
        case "retry":
          return "Download failed — tap to retry";
        default:
          return "Download";
      }
    });

    const iconName = computed(() => {
      switch (kind.value) {
        case "ready":
          return "check";
        case "other":
          return "download-check";
        default:
          return "download";
      }
    });

    const busy = computed(() => isBusyDownloadKind(kind.value));

    async function onClick(e) {
      e.stopPropagation();
      e.preventDefault();
      if (kind.value === "hide" || kind.value === "ready" || busy.value) return;
      try {
        await downloadTrack(props.track);
      } catch (err) {
        console.error(err);
        showToast(err.message || "Download failed");
      }
    }

    return { kind, title, iconName, busy, onClick };
  },
  template: `
    <button
      v-if="kind !== 'hide'"
      type="button"
      class="icon-btn row-download"
      :class="{
        'is-ready': kind === 'ready',
        'is-other': kind === 'other',
        'is-busy': busy,
        'is-failed': kind === 'retry',
      }"
      :title="title"
      :aria-label="title"
      :disabled="busy || kind === 'ready'"
      @click="onClick"
    >
      <span v-if="busy" class="dl-spinner" aria-hidden="true"></span>
      <Icon v-else :name="iconName" />
    </button>
  `,
});
