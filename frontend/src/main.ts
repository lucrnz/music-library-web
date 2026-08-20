/**
 * Vue 3 ESM entry — no bundler.
 */
import { createApp } from "vue";
import { router } from "@/router";
import App from "@/components/App.vue";
import { loadPlaylist } from "@/stores/playlist";
import { applyExpanded, applyPlaybackPosition } from "@/stores/playerPrefs";
import { refreshPlayerCovers } from "@/stores/playerSession";
import { applyVolume, initAudioListeners } from "@/stores/player";
import {
  bindNetworkConstraintEffects,
  loadCodecs,
} from "@/stores/settings";
import { initExclusiveAudio } from "@/stores/exclusiveAudio";
import { pl } from "@/stores/playlist";
import { bindConnectivityToasts } from "@/connectivityUi";
import { initArtistArtPending } from "@/artistArt/pending";
import { initDownloads } from "@/downloads/index";
import { bindConnectivityStore } from "@/stores/connectivity";
import { registerServiceWorker } from "@/pwa";
import { initDiag } from "@/diag/log";
import { initListens } from "@/listens/flush";

initDiag();
initListens();
loadPlaylist();
applyVolume();
applyExpanded();
applyPlaybackPosition();
initAudioListeners();
// Connectivity store before codecs so the first probe report is mirrored.
bindConnectivityStore();
loadCodecs();
initExclusiveAudio();
bindNetworkConstraintEffects(() => pl.tracks);
bindConnectivityToasts();
// Wait for downloads catalog so restored tracks can use local OPFS covers.
initDownloads().then(() => refreshPlayerCovers());
initArtistArtPending();
registerServiceWorker();

const app = createApp(App);
app.use(router);
app.mount("#app");
