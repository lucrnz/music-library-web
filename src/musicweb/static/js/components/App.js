import { computed, defineComponent } from "vue";
import { useRoute } from "vue-router";
import LibraryView from "./library/LibraryView.js";
import PlaylistView from "./playlist/PlaylistView.js";
import PlayerBar from "./player/PlayerBar.js";
import SettingsModal from "./settings/SettingsModal.js";
import TabBar from "./layout/TabBar.js";

/**
 * Shell: dual-pane library + queue (desktop CSS forces both visible).
 * Mobile hides the non-active pane via .hidden; /queue selects queue tab.
 */
export default defineComponent({
  name: "App",
  components: {
    LibraryView,
    PlaylistView,
    PlayerBar,
    SettingsModal,
    TabBar,
  },
  setup() {
    const route = useRoute();
    const onQueue = computed(() => route.meta.pane === "queue");
    return { onQueue };
  },
  template: `
    <main>
      <LibraryView :class="{ hidden: onQueue }" />
      <PlaylistView :class="{ hidden: !onQueue }" />
    </main>
    <PlayerBar />
    <SettingsModal />
    <TabBar />
  `,
});
