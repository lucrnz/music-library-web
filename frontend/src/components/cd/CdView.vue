<script setup lang="ts">
import { computed, onUnmounted } from "vue";
import { isDesktopViewport } from "@/layout";
import CdNowPlaying from "@/components/cd/CdNowPlaying.vue";
import CdTrackList from "@/components/cd/CdTrackList.vue";
import CdFilesystem from "@/components/cd/CdFilesystem.vue";
import CdRomQueue from "@/components/cd/CdRomQueue.vue";
import { cd } from "@/stores/cd";
import { setExpanded } from "@/stores/playerPrefs";

const isData = computed(() => cd.mediaKind === "data");

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
    <template v-if="isData">
      <CdFilesystem />
      <CdRomQueue />
    </template>
    <CdTrackList v-else />
  </section>
</template>
