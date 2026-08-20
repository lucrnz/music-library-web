<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import RadioNowPlaying from "@/components/radio/RadioNowPlaying.vue";
import { setTabOpen } from "@/stores/radio";

onMounted(() => {
  setTabOpen(true);
});
onUnmounted(() => {
  setTabOpen(false);
});
</script>

<template>
  <section id="view-radio" class="view" aria-label="Radio">
    <header class="view-bar">
      <h1 class="radio-view-title">Radio</h1>
    </header>
    <RadioNowPlaying layout="room" />
  </section>
</template>
