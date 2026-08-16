<script setup lang="ts">
import { computed } from "vue";
import Icon from "@/components/icons/Icon.vue";

/**
 * Presentational settings dropdown (quality, exclusive, etc.).
 * Parent owns open state via openMenu + menuId; this control closes itself on choose.
 */
export interface SettingsSelectOption {
  id: string;
  label?: string;
}

const props = withDefaults(defineProps<{
  menuId: string;
  labelId: string;
  fieldLabel: string;
  options: SettingsSelectOption[];
  selectedId?: string | null;
  openMenu?: string | null;
  placeholder?: string | null;
  disabled?: boolean;
}>(), { selectedId: null, openMenu: null, placeholder: null, disabled: false });
const emit = defineEmits<{
  toggle: [id: string];
  choose: [id: string];
}>();
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

    function isSelected(id: string | null | undefined) {
      return props.selectedId === id || (props.selectedId == null && id == null);
    }

    function onToggle() {
      if (props.disabled) return;
      emit("toggle", props.menuId);
    }

    function onChoose(id: string) {
      if (props.disabled) return;
      emit("choose", id);
      emit("toggle", props.menuId);
    }
</script>

<template>
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
</template>
