/**
 * Shared action-menu row (card + dropdown).
 */
import { defineComponent } from "vue";
import Icon from "../icons/Icon.js";

export default defineComponent({
  name: "ActionMenuItem",
  components: { Icon },
  props: {
    item: { type: Object, required: true },
    /** `menuitem` on the desktop list; `none` inside the dialog (native button). */
    itemRole: { type: String, default: "menuitem" },
    active: { type: Boolean, default: false },
  },
  emits: ["pick"],
  setup(props, { emit }) {
    function onPick() {
      if (props.item.disabled) return;
      emit("pick", props.item);
    }
    return { onPick };
  },
  template: `
    <button
      type="button"
      class="action-menu-item"
      :class="{
        'is-danger': item.danger,
        'is-disabled': item.disabled,
        'is-active': active,
      }"
      :role="itemRole === 'none' ? undefined : itemRole"
      :disabled="!!item.disabled"
      @click="onPick"
    >
      <Icon v-if="item.icon" :name="item.icon" />
      <span class="action-menu-item-label">{{ item.label }}</span>
    </button>
  `,
});
