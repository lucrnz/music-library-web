/**
 * Vue 3 ESM entry — no bundler.
 */
import { createApp } from "vue";
import { router } from "./router.js";
import App from "./components/App.js";
import { loadPlaylist } from "./stores/playlist.js";
import { applyExpanded } from "./stores/playerPrefs.js";
import { refreshPlayerCovers } from "./stores/playerSession.js";
import { applyVolume, initAudioListeners } from "./stores/player.js";
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
import { initDiag } from "./diag/log.js";

initDiag();
loadPlaylist();
applyVolume();
applyExpanded();
initAudioListeners();
// Connectivity store before codecs so the first probe report is mirrored.
bindConnectivityStore();
loadCodecs();
initExclusiveAudio();
bindNetworkConstraintEffects(() => pl.tracks);
bindConnectivityToasts();
// Wait for downloads catalog so restored tracks can use local OPFS covers.
initDownloads().then(() => refreshPlayerCovers());
registerServiceWorker();

const app = createApp(App);
app.use(router);
app.mount("#app");
