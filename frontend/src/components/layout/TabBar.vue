<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "@/components/icons/Icon.vue";
import { cdEntryAllowed } from "@/stores/cd";
import { rememberLibraryRoute, ui } from "@/stores/ui";
const route = useRoute();
    const router = useRouter();
    const pane = computed(() => String(route.meta.pane || "library"));

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

    function goRadio() {
      router.push({ name: "radio" });
    }

    const showCdTab = computed(() => cdEntryAllowed());

    function goCd() {
      router.push({ name: "cd" });
    }
</script>

<template>
    <nav id="tab-bar" aria-label="Views">
      <button
        type="button"
        class="tab"
        :class="{ active: pane === 'library' }"
        aria-label="Library"
        @click="goLibrary"
      >
        <Icon name="library" /><span>Library</span>
      </button>
      <button
        type="button"
        class="tab"
        :class="{ active: pane === 'queue' }"
        aria-label="Playlist"
        @click="goQueue"
      >
        <Icon name="queue" /><span>Playlist</span>
      </button>
      <button
        type="button"
        class="tab"
        :class="{ active: pane === 'radio' }"
        aria-label="Radio"
        @click="goRadio"
      >
        <Icon name="radio" /><span>Radio</span>
      </button>
      <button
        v-if="showCdTab"
        type="button"
        class="tab"
        :class="{ active: pane === 'cd' }"
        aria-label="CD"
        @click="goCd"
      >
        <Icon name="cd" /><span>CD</span>
      </button>
    </nav>
</template>
