/**
 * Grid card for a folder browse file (path chrome + optional Track).
 * FileRowModel = { path, name, id, track: Track|null, displayName, cover }
 */
import { computed, defineComponent } from "vue";
import DownloadIcon from "../../downloads/DownloadIcon.js";
import Icon from "../../icons/Icon.js";
import { playOrQueueTrack, queueOnly } from "../rows.js";

export default defineComponent({
  name: "FileCard",
  components: { Icon, DownloadIcon },
  props: {
    file: { type: Object, required: true },
    selected: { type: Boolean, default: false },
  },
  emits: ["select"],
  setup(props, { emit }) {
    const cover = computed(
      () => props.file.cover || "/static/img/placeholder.svg"
    );
    const title = computed(
      () => props.file.displayName || props.file.name || ""
    );
    /** @type {import("vue").ComputedRef<import("../../../models/track.js").Track|null>} */
    const track = computed(() => props.file.track || null);

    function queueEntry() {
      if (track.value) return track.value;
      if (props.file.id) return props.file.id;
      return null;
    }

    async function onClick(e) {
      if (e.metaKey || e.ctrlKey) {
        emit("select", props.file, e);
        return;
      }
      const entry = queueEntry();
      if (!entry) return;
      await playOrQueueTrack(entry);
    }

    async function onAdd(e) {
      e.stopPropagation();
      const entry = queueEntry();
      if (!entry) return;
      await queueOnly(entry);
    }

    return { cover, title, track, onClick, onAdd };
  },
  template: `
    <div
      class="media-card media-card--file"
      :class="{ selected }"
      @click="onClick"
    >
      <span class="media-card-cover-wrap">
        <img class="media-card-cover" :src="cover" alt="" loading="lazy" />
        <button
          type="button"
          class="icon-btn media-card-add"
          title="Add to playlist"
          aria-label="Add to playlist"
          @click="onAdd"
        ><Icon name="plus" /></button>
      </span>
      <span class="media-card-title">{{ title }}</span>
      <DownloadIcon v-if="track" :track="track" />
    </div>
  `,
});
