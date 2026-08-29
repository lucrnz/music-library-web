<script setup lang="ts">
import { onUnmounted } from "vue";
import { isDesktopViewport } from "@/layout";
import CdNowPlaying from "@/components/cd/CdNowPlaying.vue";
import CdTrackList from "@/components/cd/CdTrackList.vue";
import { setExpanded } from "@/stores/playerPrefs";

onUnmounted(() => {
  if (!isDesktopViewport()) setExpanded(false);
});
</script>

<template>
  <section id="view-cd" class="view" aria-label="CD">
    <header class="view-bar">
      <h1 class="cd-view-title">CD</h1>
    </header>
    <CdNowPlaying layout="room" />
    <CdTrackList />
  </section>
</template>
