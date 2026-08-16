/**
 * Shared labeled rows for Playback details (modal + popover).
 */
import { defineComponent } from "vue";

export default defineComponent({
  name: "PlaybackDetailsBody",
  props: {
    rows: {
      type: Array,
      default: () => [],
    },
  },
  template: `
    <dl v-if="rows.length" class="playback-details-list">
      <div
        v-for="row in rows"
        :key="row.key"
        class="playback-details-row"
      >
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>
    <p v-else class="playback-details-empty">No details</p>
  `,
});
