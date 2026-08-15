/**
 * Compact lossy-source mark. Renders nothing when kind is null.
 */
import { computed, defineComponent } from "vue";
import { LOSSY_SOURCE_COPY } from "../../lossyKind.js";
import { showToast } from "../../stores/ui.js";
import Icon from "../icons/Icon.js";

const ICONS = {
  mp3: "fmt-mp3",
  aac: "fmt-aac",
  lossy: "fmt-lossy",
  mixed: "fmt-lossy",
};

export default defineComponent({
  name: "LossyMark",
  components: { Icon },
  props: {
    kind: { type: String, default: null },
  },
  setup(props) {
    const icon = computed(() => ICONS[props.kind] || null);
    function onActivate(e) {
      e.preventDefault();
      e.stopPropagation();
      showToast(LOSSY_SOURCE_COPY);
    }
    return { icon, copy: LOSSY_SOURCE_COPY, onActivate };
  },
  template: `
    <button
      v-if="icon"
      type="button"
      class="lossy-mark"
      :title="copy"
      :aria-label="copy"
      @click="onActivate"
    ><Icon :name="icon" /></button>
  `,
});
