/** Grid card for a folder directory. */
import { defineComponent } from "vue";
import Icon from "../../icons/Icon.js";

export default defineComponent({
  name: "FolderCard",
  components: { Icon },
  props: {
    dir: { type: Object, required: true },
    selected: { type: Boolean, default: false },
  },
  emits: ["open", "select"],
  setup(props, { emit }) {
    function onClick(e) {
      if (e.metaKey || e.ctrlKey) {
        emit("select", props.dir, e);
        return;
      }
      emit("open", props.dir);
    }
    return { onClick };
  },
  template: `
    <button
      type="button"
      class="media-card"
      :class="{ selected }"
      @click="onClick"
    >
      <span class="media-card-cover media-card-cover--icon">
        <Icon name="folder" />
      </span>
      <span class="media-card-title">{{ dir.name }}</span>
    </button>
  `,
});
