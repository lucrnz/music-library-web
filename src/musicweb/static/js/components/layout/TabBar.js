import { computed, defineComponent, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "../icons/Icon.js";
import { rememberLibraryRoute, ui } from "../../stores/ui.js";

export default defineComponent({
  name: "TabBar",
  components: { Icon },
  setup() {
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
      router.push(ui.lastLibrary);
    }

    function goQueue() {
      router.push({ name: "queue" });
    }

    return { onQueue, goLibrary, goQueue };
  },
  template: `
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
  `,
});
