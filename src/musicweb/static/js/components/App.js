import { computed, defineComponent } from "vue";
import { useRoute } from "vue-router";
import LibraryView from "./library/LibraryView.js";
import PlaylistView from "./playlist/PlaylistView.js";
import PlayerBar from "./player/PlayerBar.js";
import SettingsModal from "./settings/SettingsModal.js";
import DownloadsModal from "./downloads/DownloadsModal.js";
import DownloadsLibraryView from "./downloads/DownloadsLibraryView.js";
import TabBar from "./layout/TabBar.js";

/**
 * Shell: dual-pane library + queue (desktop CSS forces both visible).
 * Mobile hides the non-active pane via .hidden; /queue selects queue tab.
 */
export default defineComponent({
  name: "App",
  components: {
    LibraryView,
    DownloadsLibraryView,
    PlaylistView,
    PlayerBar,
    SettingsModal,
    DownloadsModal,
    TabBar,
  },
  setup() {
    const route = useRoute();
    const onQueue = computed(() => route.meta.pane === "queue");
    const onDownloads = computed(() => route.meta.mode === "downloads");
    return { onQueue, onDownloads };
  },
  template: `
    <main>
      <DownloadsLibraryView v-if="onDownloads" :class="{ hidden: onQueue }" />
      <LibraryView v-else :class="{ hidden: onQueue }" />
      <PlaylistView :class="{ hidden: !onQueue }" />
    </main>
    <PlayerBar />
    <SettingsModal />
    <DownloadsModal />
    <TabBar />
  `,
});
