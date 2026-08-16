<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "@/components/icons/Icon.vue";
import { rememberLibraryRoute, ui } from "@/stores/ui";
const route = useRoute();
    const router = useRouter();
    const onQueue = computed(() => route.meta.pane === "queue");

    watch(
      () => route.fullPath,
      () => rememberLibraryRoute(route),
      { immediate: true }
    );

    function goLibrary() {
      if (route.meta.pane === "library") return;
      router.push({
        name: ui.lastLibrary.name,
        params: ui.lastLibrary.params,
        query: ui.lastLibrary.query as Record<string, string | string[]>,
      });
    }

    function goQueue() {
      router.push({ name: "queue" });
    }
</script>

<template>
    <nav id="tab-bar" aria-label="Views">
      <button
        type="button"
        class="tab"
        :class="{ active: !onQueue }"
        aria-label="Library"
        @click="goLibrary"
      >
        <Icon name="library" /><span>Library</span>
      </button>
      <button
        type="button"
        class="tab"
        :class="{ active: onQueue }"
        aria-label="Playlist"
        @click="goQueue"
      >
        <Icon name="queue" /><span>Playlist</span>
      </button>
    </nav>
</template>
