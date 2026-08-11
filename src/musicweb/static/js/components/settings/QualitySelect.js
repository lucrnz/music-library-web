import { computed, defineComponent } from "vue";
import Icon from "../icons/Icon.js";

/**
 * Presentational codec/policy dropdown for Settings.
 * Parent owns exclusive open state via openMenu + menuId.
 */
export default defineComponent({
  name: "QualitySelect",
  components: { Icon },
  props: {
    menuId: { type: String, required: true },
    labelId: { type: String, required: true },
    fieldLabel: { type: String, required: true },
    /** @type {import('vue').PropType<{ id: string, label: string }[]>} */
    options: { type: Array, required: true },
    selectedId: { type: String, default: null },
    triggerLabel: { type: String, required: true },
    /** Parent openMenu ref value */
    openMenu: { type: String, default: null },
    /**
     * Optional rows before main options (e.g. Same as Wi‑Fi).
     * @type {import('vue').PropType<{ id: string, label: string }[]>}
     */
    leadingOptions: { type: Array, default: () => [] },
  },
  emits: ["toggle", "choose"],
  setup(props, { emit }) {
    const isOpen = computed(() => props.openMenu === props.menuId);

    function isSelected(id) {
      return props.selectedId === id || (props.selectedId == null && id == null);
    }

    function onToggle() {
      emit("toggle", props.menuId);
    }

    function onChoose(id) {
      emit("choose", id);
    }

    return { isOpen, isSelected, onToggle, onChoose };
  },
  template: `
    <div class="quality-field">
      <div class="quality-field-label" :id="labelId">{{ fieldLabel }}</div>
      <div class="codec-dropdown" :class="{ open: isOpen }">
        <button
          type="button"
          class="codec-trigger"
          aria-haspopup="listbox"
          :aria-expanded="isOpen ? 'true' : 'false'"
          :aria-labelledby="labelId"
          @click="onToggle"
        >
          <span class="codec-trigger-label">{{ triggerLabel }}</span>
          <Icon name="chevron-down" />
        </button>
        <ul
          v-show="isOpen"
          class="codec-menu"
          role="listbox"
          :aria-labelledby="labelId"
        >
          <li
            v-for="opt in leadingOptions"
            :key="'lead-' + opt.id"
            role="option"
            class="codec-option"
            :class="{ selected: isSelected(opt.id) }"
            :aria-selected="isSelected(opt.id) ? 'true' : 'false'"
            tabindex="-1"
            @click="onChoose(opt.id)"
          >
            <span class="codec-option-label">{{ opt.label }}</span>
            <Icon v-if="isSelected(opt.id)" name="check" />
          </li>
          <li
            v-for="opt in options"
            :key="opt.id"
            role="option"
            class="codec-option"
            :class="{ selected: isSelected(opt.id) }"
            :aria-selected="isSelected(opt.id) ? 'true' : 'false'"
            tabindex="-1"
            @click="onChoose(opt.id)"
          >
            <span class="codec-option-label">{{ opt.label }}</span>
            <Icon v-if="isSelected(opt.id)" name="check" />
          </li>
        </ul>
      </div>
      <slot />
    </div>
  `,
});
