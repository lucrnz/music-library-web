/**
 * Folder browse file row: path chrome + optional Track.
 * FileRowModel = { path, name, id, track: Track|null, displayName, cover }
 */
import { computed, defineComponent } from "vue";
import DownloadIcon from "../../downloads/DownloadIcon.js";
import Icon from "../../icons/Icon.js";
import { playOrQueueTrack, queueOnly } from "../rows.js";

export default defineComponent({
  name: "FileRow",
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

    /** Full Track when attached; otherwise bare id for addToQueue meta fetch. */
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
      class="row"
      :class="{ selected }"
      @click="onClick"
    >
      <span class="row-cover-wrap">
        <img class="row-cover" :src="cover" alt="" loading="lazy" />
      </span>
      <span class="row-meta">
        <span class="row-title">{{ title }}</span>
      </span>
      <DownloadIcon v-if="track" :track="track" />
      <button
        type="button"
        class="icon-btn row-add"
        title="Add to playlist"
        aria-label="Add to playlist"
        @click="onAdd"
      ><Icon name="plus" /></button>
    </div>
  `,
});