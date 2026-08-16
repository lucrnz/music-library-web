<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { downloads } from "@/downloads/state";

const BASE_MODES = [
  { id: "folders", label: "Folders", name: "folders" },
  { id: "artists", label: "Artists", name: "artists" },
  { id: "albums", label: "Albums", name: "albums" },
  { id: "search", label: "Search", name: "search" },
];
const route = useRoute();
    const router = useRouter();
    const activeMode = computed(() => route.meta.mode || "folders");
    const modes = computed(() => {
      if (!downloads.enabled) return BASE_MODES;
      return [
        ...BASE_MODES,
        { id: "downloads", label: "Downloads", name: "downloads" },
      ];
    });

    function select(mode: { id: string; label: string; name: string }) {
      router.push({ name: mode.name });
    }
</script>

<template>
    <div class="mode-bar" role="tablist" aria-label="Browse mode">
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        class="mode-btn"
        :class="{ active: activeMode === m.id }"
        role="tab"
        :aria-selected="activeMode === m.id"
        @click="select(m)"
      >{{ m.label }}</button>
    </div>
</template>
