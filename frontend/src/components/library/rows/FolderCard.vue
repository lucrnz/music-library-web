<script setup lang="ts">
/** Grid card for a folder directory. */

import Icon from "@/components/icons/Icon.vue";
import type { BrowseDir } from "@/api";
const props = withDefaults(defineProps<{
  dir: BrowseDir;
  selected?: boolean;
}>(), { selected: false });
const emit = defineEmits<{
  open: [dir: BrowseDir];
  select: [dir: BrowseDir, e?: MouseEvent];
}>();
function onClick(e: MouseEvent) {
      if (e.metaKey || e.ctrlKey) {
        emit("select", props.dir, e);
        return;
      }
      emit("open", props.dir);
    }
</script>

<template>
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
</template>
