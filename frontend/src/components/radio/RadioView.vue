<script setup lang="ts">
import { onUnmounted } from "vue";
import { isDesktopViewport } from "@/layout";
import RadioNowPlaying from "@/components/radio/RadioNowPlaying.vue";
import { setExpanded } from "@/stores/playerPrefs";

onUnmounted(() => {
  if (!isDesktopViewport()) setExpanded(false);
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
