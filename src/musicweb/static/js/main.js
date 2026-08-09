/**
 * Vue 3 ESM entry — no bundler.
 */
import { createApp } from "vue";
import { router } from "./router.js";
import App from "./components/App.js";
import { loadPlaylist } from "./stores/playlist.js";
import {
  applyVolume,
  initAudioListeners,
} from "./stores/player.js";
import { loadCodecs } from "./stores/settings.js";
import { initDownloads } from "./stores/downloads.js";

loadPlaylist();
applyVolume();
initAudioListeners();
loadCodecs();
initDownloads();

const app = createApp(App);
app.use(router);
app.mount("#app");
