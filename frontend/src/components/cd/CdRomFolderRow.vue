<script setup lang="ts">
import Icon from "@/components/icons/Icon.vue";

defineProps<{
  name: string;
}>();
</script>

<template>
  <span class="cdrom-folder-row">
    <Icon name="folder" />
    <span class="cdrom-folder-name">{{ name }}</span>
  </span>
</template>
