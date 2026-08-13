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
import {
  bindNetworkConstraintEffects,
  loadCodecs,
} from "./stores/settings.js";
import { initExclusiveAudio } from "./stores/exclusiveAudio.js";
import { pl } from "./stores/playlist.js";
import { bindConnectivityToasts } from "./connectivityUi.js";
import { initDownloads } from "./downloads/index.js";
import { bindConnectivityStore } from "./stores/connectivity.js";
import { registerServiceWorker } from "./pwa.js";

loadPlaylist();
applyVolume();
applyExpanded();
initAudioListeners();
loadCodecs();
initExclusiveAudio();
bindNetworkConstraintEffects(() => pl.tracks);
// Connectivity store before downloads (downloads only hooks policy/orphans).
bindConnectivityStore();
bindConnectivityToasts();
// Wait for downloads catalog so restored tracks can use local OPFS covers.
initDownloads().then(() => refreshPlayerCovers());
registerServiceWorker();

const app = createApp(App);
app.use(router);
app.mount("#app");
