<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useLibraryLocation } from "@/components/library/useLibraryLocation";
import { downloads } from "@/downloads/state";

const BASE_MODES = [
  { id: "artists", label: "Artists", name: "artists" },
  { id: "albums", label: "Albums", name: "albums" },
  { id: "search", label: "Search", name: "search" },
  { id: "stats", label: "Stats", name: "stats" },
];
const router = useRouter();
const { mode: activeMode } = useLibraryLocation();
const btnEls = new Map<string, HTMLButtonElement>();
const modes = computed(() => {
  if (!downloads.enabled) return BASE_MODES;
  return [
    ...BASE_MODES,
    { id: "downloads", label: "Downloads", name: "downloads" },
  ];
});

function setBtnRef(id: string, el: unknown) {
  if (el instanceof HTMLButtonElement) btnEls.set(id, el);
  else btnEls.delete(id);
}

function scrollActiveIntoView() {
  btnEls.get(activeMode.value)?.scrollIntoView({
    inline: "nearest",
    block: "nearest",
  });
}

function select(mode: { id: string; label: string; name: string }) {
  router.push({ name: mode.name });
}

onMounted(scrollActiveIntoView);
watch([activeMode, modes], scrollActiveIntoView, { flush: "post" });
</script>

<template>
    <div class="mode-bar" role="tablist" aria-label="Browse mode">
      <button
        v-for="m in modes"
        :key="m.id"
        :ref="(el) => setBtnRef(m.id, el)"
        type="button"
        class="mode-btn"
        :class="{ active: activeMode === m.id }"
        role="tab"
        :aria-selected="activeMode === m.id"
        @click="select(m)"
      >{{ m.label }}</button>
    </div>
</template>
