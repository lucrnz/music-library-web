import { computed, defineComponent } from "vue";
import Icon from "../icons/Icon.js";

/**
 * Presentational settings dropdown (quality, exclusive, etc.).
 * Parent owns open state via openMenu + menuId; this control closes itself on choose.
 */
export default defineComponent({
  name: "SettingsSelect",
  components: { Icon },
  props: {
    menuId: { type: String, required: true },
    labelId: { type: String, required: true },
    fieldLabel: { type: String, required: true },
    /** @type {import('vue').PropType<{ id: string, label: string }[]>} */
    options: { type: Array, required: true },
    selectedId: { type: String, default: null },
    /** Parent openMenu ref value */
    openMenu: { type: String, default: null },
    /** Trigger text when selectedId is null / not in options */
    placeholder: { type: String, default: null },
    disabled: { type: Boolean, default: false },
  },
  emits: ["toggle", "choose"],
  setup(props, { emit }) {
    const isOpen = computed(
      () => !props.disabled && props.openMenu === props.menuId
    );

    const triggerLabel = computed(() => {
      const id = props.selectedId;
      if (id != null) {
        const hit = props.options.find((o) => o.id === id);
        if (hit) return hit.label;
      }
      if (props.placeholder) return props.placeholder;
      return "—";
    });

    function isSelected(id) {
      return props.selectedId === id || (props.selectedId == null && id == null);
    }

    function onToggle() {
      if (props.disabled) return;
      emit("toggle", props.menuId);
    }

    function onChoose(id) {
      if (props.disabled) return;
      emit("choose", id);
      emit("toggle", props.menuId);
    }

    return { isOpen, triggerLabel, isSelected, onToggle, onChoose };
  },
  template: `
    <div class="settings-field">
      <div class="settings-field-label" :id="labelId">{{ fieldLabel }}</div>
      <div class="settings-select" :class="{ open: isOpen, disabled }">
        <button
          type="button"
          class="settings-select-trigger"
          aria-haspopup="listbox"
          :aria-expanded="isOpen ? 'true' : 'false'"
          :aria-labelledby="labelId"
          :disabled="disabled"
          @click="onToggle"
        >
          <span class="settings-select-trigger-label">{{ triggerLabel }}</span>
          <Icon name="chevron-down" />
        </button>
        <ul
          v-show="isOpen"
          class="settings-select-menu"
          role="listbox"
          :aria-labelledby="labelId"
        >
          <li
            v-for="opt in options"
            :key="opt.id"
            role="option"
            class="settings-select-option"
            :class="{ selected: isSelected(opt.id) }"
            :aria-selected="isSelected(opt.id) ? 'true' : 'false'"
            tabindex="-1"
            @click="onChoose(opt.id)"
          >
            <span class="settings-select-option-label">{{ opt.label }}</span>
            <Icon v-if="isSelected(opt.id)" name="check" />
          </li>
        </ul>
      </div>
      <slot />
    </div>
  `,
});
