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
  refreshPlayerCovers,
} from "./stores/player.js";
import { loadCodecs } from "./stores/settings.js";
import { initDownloads } from "./downloads/index.js";

loadPlaylist();
applyVolume();
initAudioListeners();
loadCodecs();
// Wait for downloads catalog so restored tracks can use local OPFS covers.
initDownloads().then(() => refreshPlayerCovers());

const app = createApp(App);
app.use(router);
app.mount("#app");
