/**
 * Vue 3 ESM entry — no bundler.
 */
import { createApp } from "vue";
import { router } from "./router.js";
import App from "./components/App.js";
import { loadPlaylist } from "./stores/playlist.js";
import {
  applyExpanded,
  applyVolume,
  initAudioListeners,
  refreshPlayerCovers,
} from "./stores/player.js";
import { loadCodecs } from "./stores/settings.js";
import { bindConnectivityToasts } from "./connectivityUi.js";
import { initDownloads } from "./downloads/index.js";
import { registerServiceWorker } from "./pwa.js";

loadPlaylist();
applyVolume();
applyExpanded();
initAudioListeners();
loadCodecs();
bindConnectivityToasts();
// Wait for downloads catalog so restored tracks can use local OPFS covers.
initDownloads().then(() => refreshPlayerCovers());
registerServiceWorker();

const app = createApp(App);
app.use(router);
app.mount("#app");
