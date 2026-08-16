<script setup lang="ts">
/**
 * Shared action-menu row (card + dropdown).
 */

import Icon from "@/components/icons/Icon.vue";
import type { ActionItem } from "@/components/menu/actionItem";
const props = withDefaults(defineProps<{
  item: ActionItem;
  itemRole?: string;
  active?: boolean;
}>(), { itemRole: "menuitem", active: false });
const emit = defineEmits<{
  pick: [item: ActionItem];
}>();
function onPick() {
      if (props.item.disabled) return;
      emit("pick", props.item);
    }
</script>

<template>
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
</template>
