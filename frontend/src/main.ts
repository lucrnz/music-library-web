/**
 * Vue 3 ESM entry — no bundler.
 */
import { createApp } from "vue";
import { router } from "@/router";
import App from "@/components/App.vue";
import { loadPlaylist } from "@/stores/playlist";
import {
  applyExpanded,
  applyPlaybackPosition,
  hydrateOutputVolume,
  initOutputVolume,
} from "@/stores/playerPrefs";
import { initPlayerSession, updateMediaSession } from "@/stores/playerSession";
import { initAudioListeners } from "@/stores/player";
import { initRadioListeners } from "@/stores/radio";
import { loadCodecs } from "@/stores/settings";
import { syncCompanionConnection } from "@/exclusive/companionClient";
import { initExclusiveAudio } from "@/stores/exclusiveAudio";
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
hydrateOutputVolume();
initOutputVolume();
applyExpanded();
applyPlaybackPosition();
initAudioListeners();
initRadioListeners();
// Connectivity store before codecs so the first probe report is mirrored.
bindConnectivityStore();
initPlayerSession();
loadCodecs();
void initExclusiveAudio().then(() => syncCompanionConnection());
bindConnectivityToasts();
// Wait for downloads catalog so restored tracks can use local OPFS covers.
initDownloads().then(() => {
  updateMediaSession();
  syncCompanionConnection();
});
initArtistArtPending();
registerServiceWorker();

const app = createApp(App);
app.use(router);
app.mount("#app");
