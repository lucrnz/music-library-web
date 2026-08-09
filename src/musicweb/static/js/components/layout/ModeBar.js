import { computed, defineComponent } from "vue";
import { useRoute, useRouter } from "vue-router";

const MODES = [
  { id: "folders", label: "Folders", name: "folders" },
  { id: "artists", label: "Artists", name: "artists" },
  { id: "albums", label: "Albums", name: "albums" },
  { id: "search", label: "Search", name: "search" },
];

export default defineComponent({
  name: "ModeBar",
  setup() {
    const route = useRoute();
    const router = useRouter();
    const activeMode = computed(() => route.meta.mode || "folders");

    function select(mode) {
      router.push({ name: mode.name });
    }

    return { MODES, activeMode, select };
  },
  template: `
    <div class="mode-bar" role="tablist" aria-label="Browse mode">
      <button
        v-for="m in MODES"
        :key="m.id"
        type="button"
        class="mode-btn"
        :class="{ active: activeMode === m.id }"
        role="tab"
        :aria-selected="activeMode === m.id"
        @click="select(m)"
      >{{ m.label }}</button>
    </div>
  `,
});
