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

loadPlaylist();
applyVolume();
initAudioListeners();
loadCodecs();

const app = createApp(App);
app.use(router);
app.mount("#app");
