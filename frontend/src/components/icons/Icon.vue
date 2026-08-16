<script setup lang="ts">
const props = defineProps<{
  name: string;
}>();
</script>

<template>
    <svg class="icon" aria-hidden="true">
      <use :href="'#i-' + name" />
    </svg>
</template>
