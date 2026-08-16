<script setup lang="ts">
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
    <div
      class="row"
      :class="{ selected }"
      @click="onClick"
    >
      <span class="row-icon"><Icon name="folder" /></span>
      <span class="row-meta"><span class="row-title">{{ dir.name }}</span></span>
      <span class="row-chevron"><Icon name="chevron-right" /></span>
    </div>
</template>
