import { defineComponent } from "vue";
import Icon from "../../icons/Icon.js";

export default defineComponent({
  name: "FolderRow",
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
    <div
      class="row"
      :class="{ selected }"
      @click="onClick"
    >
      <span class="row-icon"><Icon name="folder" /></span>
      <span class="row-meta"><span class="row-title">{{ dir.name }}</span></span>
      <span class="row-chevron"><Icon name="chevron-right" /></span>
    </div>
  `,
});
